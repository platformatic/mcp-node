import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { execAsync, askPermission, getSelectedNodeVersion } from "../utils/helpers.js";
import { ExecOptionsWithInput } from "../types/index.js";

// Cache structure to avoid re-downloading the same packages
interface PackageCache {
  packageDir: string;
  metadata: any;
  readme: string;
  timestamp: Date;
}

// In-memory cache for quick lookups
const packageCaches = new Map<string, PackageCache>();

// Path for the persistent cache directory
const NPM_DOCS_CACHE_DIR = path.join(os.tmpdir(), 'mcp-node-docs-cache');

// Ensure the cache directory exists
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(NPM_DOCS_CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error(`Failed to create cache directory: ${error}`);
  }
}

// Function to get cache key for a package+version
function getCacheKey(packageName: string, version: string): string {
  return `${packageName}@${version}`;
}

// Function to check if a package is already cached
async function getFromCache(packageName: string, version: string): Promise<PackageCache | null> {
  const cacheKey = getCacheKey(packageName, version);
  
  // First check in-memory cache
  if (packageCaches.has(cacheKey)) {
    return packageCaches.get(cacheKey)!;
  }
  
  // Then check on-disk cache
  const packageCacheDir = path.join(NPM_DOCS_CACHE_DIR, cacheKey);
  try {
    // Check if directory exists
    await fs.access(packageCacheDir);
    
    // Read metadata and readme from cache
    const metadata = JSON.parse(await fs.readFile(path.join(packageCacheDir, 'metadata.json'), 'utf-8'));
    const readme = await fs.readFile(path.join(packageCacheDir, 'README.md'), 'utf-8');
    
    // Get timestamp from directory stat
    const stats = await fs.stat(packageCacheDir);
    
    // Create cache entry
    const cacheEntry: PackageCache = {
      packageDir: packageCacheDir,
      metadata,
      readme,
      timestamp: stats.mtime
    };
    
    // Update in-memory cache
    packageCaches.set(cacheKey, cacheEntry);
    
    return cacheEntry;
  } catch (error) {
    // If any step fails, return null to indicate cache miss
    return null;
  }
}

// Function to save package docs to cache
async function saveToCache(packageName: string, version: string, metadata: any, readme: string): Promise<string> {
  const cacheKey = getCacheKey(packageName, version);
  const packageCacheDir = path.join(NPM_DOCS_CACHE_DIR, cacheKey);
  
  // Create package-specific cache directory
  await fs.mkdir(packageCacheDir, { recursive: true });
  
  // Write metadata and readme to cache
  await fs.writeFile(path.join(packageCacheDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
  await fs.writeFile(path.join(packageCacheDir, 'README.md'), readme);
  
  // Create and store cache entry
  const cacheEntry: PackageCache = {
    packageDir: packageCacheDir,
    metadata,
    readme,
    timestamp: new Date()
  };
  
  // Update in-memory cache
  packageCaches.set(cacheKey, cacheEntry);
  
  return packageCacheDir;
}

// Function to find README file in a directory (case-insensitive)
async function findReadmeFile(dir: string): Promise<string | null> {
  try {
    const files = await fs.readdir(dir);
    const readmeFile = files.find(file => 
      /^readme\.(md|markdown|txt|rst)$/i.test(file)
    );
    
    if (readmeFile) {
      return path.join(dir, readmeFile);
    }
    
    // Try checking package directory if direct lookup fails
    const packageJsonPath = path.join(dir, 'package', 'package.json');
    try {
      await fs.access(packageJsonPath);
      // If package.json exists in a package subdirectory, look for README there
      const packageDir = path.join(dir, 'package');
      const packageFiles = await fs.readdir(packageDir);
      const packageReadmeFile = packageFiles.find(file => 
        /^readme\.(md|markdown|txt|rst)$/i.test(file)
      );
      
      if (packageReadmeFile) {
        return path.join(packageDir, packageReadmeFile);
      }
    } catch (error) {
      // No package subdirectory or no README there
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding README: ${error}`);
    return null;
  }
}

// Register the npm documentation tool
export function registerNpmDocsTools(server: McpServer): void {
  // Ensure cache directory exists when the tool is registered
  ensureCacheDir();
  
  server.tool(
    "fetch-npm-docs",
    "Fetch documentation for an npm module, including README and metadata",
    {
      packageName: z.string().describe("Name of the npm package"),
      version: z.string().optional().describe("Specific version to fetch (defaults to latest)")
    },
    async ({ packageName, version = "latest" }) => {
      try {
        // Check if the requested package is already cached
        const cachedPackage = await getFromCache(packageName, version);
        if (cachedPackage) {
          return {
            content: [
              { 
                type: "text" as const, 
                text: `Documentation for ${packageName}@${version} (from cache):\n\n${cachedPackage.readme}`
              },
              {
                type: "text" as const,
                text: `Package Metadata:\n${JSON.stringify(cachedPackage.metadata, null, 2)}`
              }
            ]
          };
        }
        
        // Ask for permission to fetch package information
        const permissionMessage = `Fetch documentation for npm package: ${packageName}@${version}`;
        const permitted = await askPermission(permissionMessage);
        
        if (!permitted) {
          return {
            isError: true,
            content: [{ 
              type: "text" as const, 
              text: "Permission denied by user" 
            }]
          };
        }
        
        // Create a temporary directory for extraction
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-docs-'));
        
        // Execute npm view command to get package metadata with selected Node.js version
        let viewCommand = `npm view ${packageName}@${version} --json`;
        let execOptions: ExecOptionsWithInput = { 
          timeout: 30000 // 30 second timeout
        };
        
        // Handle NVM usage
        const selectedVersion = getSelectedNodeVersion();
        if (selectedVersion) {
          // Get the path to npm from the selected Node version
          const { stdout: npmPath } = await execAsync(
            `bash -c "source ~/.nvm/nvm.sh && nvm use ${selectedVersion} > /dev/null && which npm"`
          );
          
          // Use npm directly with the full path
          viewCommand = `${npmPath.trim()} view ${packageName}@${version} --json`;
        }
        
        // Execute the view command
        const { stdout: metadataOutput } = await execAsync(viewCommand, execOptions);
        const metadata = JSON.parse(metadataOutput);
        
        // Determine the exact version (in case "latest" was specified)
        const exactVersion = metadata.version || version;
        
        // Get the tarball URL from the metadata
        const tarballUrl = metadata.dist?.tarball;
        if (!tarballUrl) {
          return {
            isError: true,
            content: [{ 
              type: "text" as const, 
              text: `Error: Could not find tarball URL for ${packageName}@${exactVersion}` 
            }]
          };
        }
        
        // Download and extract the tarball to the temporary directory
        const downloadCommand = `curl -sL ${tarballUrl} | tar -xz -C ${tmpDir}`;
        await execAsync(downloadCommand);
        
        // Find the README file
        const readmePath = await findReadmeFile(tmpDir);
        if (!readmePath) {
          return {
            content: [
              { 
                type: "text" as const, 
                text: `No README found for ${packageName}@${exactVersion}`
              },
              {
                type: "text" as const,
                text: `Package Metadata:\n${JSON.stringify(metadata, null, 2)}`
              }
            ]
          };
        }
        
        // Read the README file
        const readme = await fs.readFile(readmePath, 'utf-8');
        
        // Save to cache for future use
        await saveToCache(packageName, exactVersion, metadata, readme);
        
        // Clean up temporary directory
        await fs.rm(tmpDir, { recursive: true, force: true });
        
        return {
          content: [
            { 
              type: "text" as const, 
              text: `Documentation for ${packageName}@${exactVersion}:\n\n${readme}`
            },
            {
              type: "text" as const,
              text: `Package Metadata:\n${JSON.stringify(metadata, null, 2)}`
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          isError: true,
          content: [{ 
            type: "text" as const, 
            text: `Error fetching npm documentation: ${errorMessage}` 
          }]
        };
      }
    }
  );
}

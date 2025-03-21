import { ChildProcess } from "child_process";
import { ExecOptions } from "child_process";

// Define our extended options interface
export interface ExecOptionsWithInput extends ExecOptions {
  input?: string;
  cwd?: string;
  timeout?: number;
}

// Interface for server information
export interface ServerInfo {
  process: ChildProcess;
  name: string;
  command: string;
  pid: number;
  startTime: Date;
  logs: string[];
  exitCode: number | null;
}

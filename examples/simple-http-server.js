// A simple HTTP server using only Node.js core modules
import http from 'http';

// Create the server
const server = http.createServer((req, res) => {
  // Log the incoming request
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  // Get client IP address
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.socket.remoteAddress || 
                  'unknown';
  console.log(`Request from IP: ${clientIp}`);

  // Set response headers
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Server': 'Node.js Hello World Server'
  });

  // Send response body
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Hello World Server</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 40px;
            line-height: 1.6;
            color: #333;
          }
          h1 {
            color: #0066cc;
          }
          .info {
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            border-left: 5px solid #0066cc;
          }
        </style>
      </head>
      <body>
        <h1>Hello, World!</h1>
        <div class="info">
          <p><strong>Request received:</strong> ${req.method} ${req.url}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          <p><strong>Your IP:</strong> ${clientIp}</p>
        </div>
      </body>
    </html>
  `);
});

// Set up port from environment variable or default to 3000
const PORT = process.env.PORT || 3000;

// Start the server
server.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop the server');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

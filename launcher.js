// launcher.js - Desktop Application Launcher
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Configuration
const PORT = process.env.PORT || 3000;
const APP_NAME = 'NDHSCCI Library System';

// Get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Open browser
function openBrowser(url) {
  const platform = process.platform;
  let command;
  
  if (platform === 'win32') {
    command = `start ${url}`;
  } else if (platform === 'darwin') {
    command = `open ${url}`;
  } else {
    command = `xdg-open ${url}`;
  }
  
  require('child_process').exec(command);
}

// Create system tray icon (optional - requires electron)
function createTrayIcon(serverProcess) {
  // This would require electron for a proper system tray
  // For now, we'll just show console output
  console.log('');
  console.log('========================================');
  console.log(`📚 ${APP_NAME}`);
  console.log('========================================');
  console.log('✅ Server is running');
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://${getLocalIPAddress()}:${PORT}`);
  console.log('');
  console.log('💡 Browser will open automatically...');
  console.log('⚠️  Close this window to stop the server');
  console.log('========================================');
  console.log('');
}

// Check if port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port);
  });
}

// Wait for server to be ready
function waitForServer(url, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const check = () => {
      attempts++;
      
      require('http').get(url, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error('Server did not start in time'));
        }
      }).on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error('Server did not start in time'));
        }
      });
    };
    
    check();
  });
}

// Main launcher function
async function launch() {
  try {
    // Check if port is available
    const portAvailable = await isPortAvailable(PORT);
    
    if (!portAvailable) {
      console.error(`❌ Port ${PORT} is already in use!`);
      console.log('💡 The server might already be running.');
      console.log(`   Opening browser to http://localhost:${PORT}`);
      openBrowser(`http://localhost:${PORT}`);
      setTimeout(() => process.exit(0), 2000);
      return;
    }
    
    // Start the server
    const serverPath = path.join(__dirname, 'server.js');
    
    // Check if server.js exists
    if (!fs.existsSync(serverPath)) {
      console.error('❌ server.js not found!');
      console.log('💡 Make sure server.js is in the same directory as launcher.js');
      setTimeout(() => process.exit(1), 3000);
      return;
    }
    
    console.log('🚀 Starting server...');
    
    // Spawn server process (hidden on Windows)
    const serverProcess = spawn('node', [serverPath], {
      detached: false,
      stdio: 'inherit'
    });
    
    // Handle server process errors
    serverProcess.on('error', (err) => {
      console.error('❌ Failed to start server:', err.message);
      setTimeout(() => process.exit(1), 3000);
    });
    
    // Wait for server to be ready
    const url = `http://localhost:${PORT}`;
    
    try {
      await waitForServer(url);
      
      // Server is ready, show info
      createTrayIcon(serverProcess);
      
      // Open browser after a short delay
      setTimeout(() => {
        openBrowser(url);
      }, 1000);
      
    } catch (err) {
      console.error('❌ Server failed to start:', err.message);
      serverProcess.kill();
      setTimeout(() => process.exit(1), 3000);
      return;
    }
    
    // Handle graceful shutdown
    const cleanup = () => {
      console.log('\n⚠️  Shutting down...');
      serverProcess.kill();
      setTimeout(() => process.exit(0), 1000);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
    // Keep process alive
    process.stdin.resume();
    
  } catch (err) {
    console.error('❌ Launch error:', err.message);
    setTimeout(() => process.exit(1), 3000);
  }
}

// Run launcher
launch();
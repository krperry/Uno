const { execFileSync } = require('child_process');

function killProcessByPort(port) {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
      const lines = output.split(/\r?\n/);
      const pids = [];

      lines.forEach(function (line) {
        if (line.includes(':' + port) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (/^\d+$/.test(pid)) {
            pids.push(pid);
          }
        }
      });

      const uniquePids = Array.from(new Set(pids));
      uniquePids.forEach(function (pid) {
        try {
          execFileSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' });
          console.log('Stopped process ' + pid + ' on port ' + port);
        } catch (error) {
          console.warn('Unable to stop process ' + pid + ': ' + (error && error.message ? error.message : error));
        }
      });

      if (uniquePids.length === 0) {
        console.log('No process was listening on port ' + port);
      }
      return;
    } catch (error) {
      console.warn('Unable to inspect listening processes:', error && error.message ? error.message : error);
      return;
    }
  }

  try {
    const output = execFileSync('lsof', ['-ti', ':' + port], { encoding: 'utf8' });
    const pids = output.split(/\r?\n/).filter(Boolean);
    pids.forEach(function (pid) {
      try {
        execFileSync('kill', ['-9', pid], { stdio: 'ignore' });
        console.log('Stopped process ' + pid + ' on port ' + port);
      } catch (error) {
        console.warn('Unable to stop process ' + pid + ': ' + (error && error.message ? error.message : error));
      }
    });
  } catch (error) {
    console.warn('Unable to stop process on port ' + port + ': ' + (error && error.message ? error.message : error));
  }
}

killProcessByPort(3000);

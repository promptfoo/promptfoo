import { spawn } from 'child_process';
import readline from 'readline';

const SF_PATH = process.env.STOCKFISH_PATH || 'stockfish';

async function testStockfish() {
  console.log('Testing Stockfish integration...\n');
  
  try {
    const sf = spawn(SF_PATH, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    const rl = readline.createInterface({ input: sf.stdout });

    const send = (s: string) => {
      console.log(`> ${s}`);
      sf.stdin.write(s + '\n');
    };

    // Initialize
    send('uci');
    
    // Wait for UCI acknowledgment
    await new Promise<void>((resolve) => {
      rl.on('line', (line) => {
        console.log(`< ${line}`);
        if (line === 'uciok') {
          console.log('\n✅ UCI protocol confirmed');
          resolve();
        }
      });
    });

    // Test a simple position
    send('position startpos');
    send('go depth 10');
    
    // Wait for best move
    const bestMove = await new Promise<string>((resolve) => {
      rl.on('line', (line) => {
        console.log(`< ${line}`);
        if (line.startsWith('bestmove')) {
          resolve(line.split(' ')[1]);
        }
      });
    });

    console.log(`\n✅ Stockfish suggested move: ${bestMove}`);
    console.log('✅ Stockfish integration working correctly!\n');

    sf.stdin.end();
    sf.kill();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing Stockfish:', error);
    process.exit(1);
  }
}

testStockfish(); 
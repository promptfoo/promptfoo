import { spawn } from 'child_process';
import readline from 'readline';
import { Chess } from 'chess.js';
import OpenAI from 'openai';

const SF_PATH = process.env.STOCKFISH_PATH || 'stockfish';
const SYSTEM = "You are a chess assistant. Given a FEN and side to move, output one legal chess move in UCI format, e.g., e2e4. Output only the move, nothing else.";

// Simpler, more direct prompt for GPT-5
const SYSTEM_GPT5 = "Output a legal chess move in UCI format (e.g., e2e4).";

interface StockfishOptions {
  skill?: number;
  nodes?: number;
  movetimeMs?: number;
  depth?: number;
}

async function stockfishBestMove(fen: string, opts: StockfishOptions = {}): Promise<string> {
  const { skill = 10, nodes, movetimeMs = 1000, depth } = opts;
  const sf = spawn(SF_PATH, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: sf.stdout });

  const send = (s: string) => sf.stdin.write(s + '\n');

  // Initialize Stockfish
  send('uci');
  send(`setoption name Skill Level value ${skill}`);
  send('setoption name Threads value 1');
  send('isready');

  await new Promise<void>((resolve) => {
    rl.on('line', (line) => {
      if (line === 'readyok') resolve();
    });
  });

  // Set position and calculate
  send('ucinewgame');
  send(`position fen ${fen}`);
  
  // Use nodes for reproducibility if specified, otherwise use time
  if (nodes) {
    send(`go nodes ${nodes}`);
  } else if (depth) {
    send(`go depth ${depth}`);
  } else {
    send(`go movetime ${movetimeMs}`);
  }

  const best = await new Promise<string>((resolve) => {
    rl.on('line', (line) => {
      if (line.startsWith('bestmove')) {
        resolve(line.split(' ')[1]);
      }
    });
  });

  sf.stdin.end();
  sf.kill();
  return best;
}

function isLegalUci(chess: Chess, uci: string): boolean {
  const legal = chess.moves({ verbose: true });
  return legal.some((m) => {
    const moveUci = m.from + m.to + (m.promotion || '');
    return moveUci === uci;
  });
}

async function gptMove(client: OpenAI, fen: string, side: 'w' | 'b', model: string = 'gpt-4o'): Promise<string> {
  try {
    const isGPT5 = model.includes('gpt-5');
    const completionParams: any = {
      model,
      messages: [
        { role: 'system', content: isGPT5 ? SYSTEM_GPT5 : SYSTEM },
        { role: 'user', content: `FEN: ${fen}\nSide: ${side === 'w' ? 'White' : 'Black'}` },
      ],
    };

    // GPT-5 models only support temperature=1 (the default)
    // Other models can use temperature=0 for deterministic output
    if (!isGPT5) {
      completionParams.temperature = 0;
    }

    // GPT-5 uses max_completion_tokens, others use max_tokens
    // GPT-5 reasoning models need LOTS of tokens for their internal reasoning
    if (isGPT5) {
      completionParams.max_completion_tokens = 5000;  // Very high limit for complex reasoning
    } else {
      completionParams.max_tokens = 10;
    }

    const res = await client.chat.completions.create(completionParams);
    
    const raw = (res.choices?.[0]?.message?.content || '').trim();
    
    // Try to extract move from anywhere in the response
    const m = raw.match(/[a-h][1-8][a-h][1-8][qrbn]?/i);
    const move = m ? m[0].toLowerCase() : '';
    
    return move;
  } catch (error) {
    console.error('GPT move error:', error);
    return '';
  }
}

class ChessGameProvider {
  private config: any;
  
  constructor(options: any) {
    this.config = options.config || {};
  }

  async callApi({ prompt, vars }: any) {
    const client = new OpenAI();
    
    // Handle the start_fen from either prompt or vars
    const startFenInput = prompt || vars?.start_fen || 'startpos';
    const start = startFenInput === 'startpos'
      ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      : startFenInput;

    const playAs: 'w' | 'b' = (this.config?.playAs ?? 'w') as 'w' | 'b';
    const gptModel = this.config?.gptModel || 'gpt-5-mini';  // Default to GPT-5 mini
    const skill = this.config?.stockfishSkill ?? 10;
    const nodes = this.config?.nodes ?? 0;
    const depth = this.config?.depth ?? 0;
    const movetimeMs = this.config?.movetimeMs ?? 1000;
    const maxPlies = this.config?.maxPlies ?? 120;

    const chess = new Chess(start);
    const moves: any[] = [];
    let illegalCount = 0;
    let gptRetries = 0;

    console.log(`Starting game: GPT-5 (${gptModel}) as ${playAs === 'w' ? 'White' : 'Black'} vs Stockfish skill ${skill}`);

    for (let ply = 1; ply <= maxPlies; ply++) {
      if (chess.isGameOver()) break;

      const currentSide = chess.turn();
      
      if (currentSide === playAs) {
        // GPT's turn
        let uci = await gptMove(client, chess.fen(), playAs, gptModel);
        
        // Allow one retry if illegal
        if (!uci || !isLegalUci(chess, uci)) {
          gptRetries++;
          console.log(`Illegal/invalid move attempt: "${uci}", retrying...`);
          uci = await gptMove(client, chess.fen(), playAs, gptModel);
        }
        
        if (!uci || !isLegalUci(chess, uci)) {
          illegalCount++;
          console.log(`Failed to get legal move after retry. Ending game.`);
          break;
        }
        
        try {
          chess.move({ 
            from: uci.slice(0, 2), 
            to: uci.slice(2, 4), 
            promotion: uci[4] as any
          });
          moves.push({ ply, side: playAs, uci, san: chess.history()[chess.history().length - 1] });
        } catch (e) {
          console.log(`Move application error: ${e}`);
          illegalCount++;
          break;
        }
      } else {
        // Stockfish's turn
        const uci = await stockfishBestMove(chess.fen(), { skill, nodes, depth, movetimeMs });
        
        if (!isLegalUci(chess, uci)) {
          console.log(`Stockfish returned illegal move: ${uci}. This shouldn't happen.`);
          break;
        }
        
        chess.move({ 
          from: uci.slice(0, 2), 
          to: uci.slice(2, 4), 
          promotion: uci[4] as any 
        });
        moves.push({ 
          ply, 
          side: playAs === 'w' ? 'b' : 'w', 
          uci, 
          san: chess.history()[chess.history().length - 1],
          engine: true 
        });
      }
      
      // Print progress every 10 moves
      if (ply % 20 === 0) {
        console.log(`Move ${Math.floor(ply/2)}: ${chess.fen().split(' ')[0]}`);
      }
    }

    // Determine result
    let result = '*';
    let reason = 'unfinished';
    
    if (chess.isCheckmate()) {
      result = chess.turn() === 'w' ? '0-1' : '1-0';
      reason = 'checkmate';
    } else if (chess.isDraw()) {
      result = '1/2-1/2';
      reason = chess.isStalemate() ? 'stalemate' : 
               chess.isThreefoldRepetition() ? 'threefold' : 
               chess.isInsufficientMaterial() ? 'insufficient' : 
               'fifty-move';
    } else if (illegalCount > 0) {
      // GPT couldn't make a legal move
      result = playAs === 'w' ? '0-1' : '1-0';
      reason = 'illegal-move';
    }

    const pgn = chess.pgn();
    
    console.log(`Game ended: ${result} (${reason}) after ${moves.length} plies`);

    // Return with output field for promptfoo
    return {
      output: {
        result,
        reason,
        pgn,
        summary: { 
          illegalCount, 
          gptRetries,
          plyCount: moves.length, 
          stockfishSkill: skill, 
          nodes, 
          depth,
          movetimeMs, 
          playAs,
          gptModel
        },
        moves: moves.slice(0, 10), // Return first 10 moves for inspection
        finalPosition: chess.fen()
      }
    };
  }

  id() {
    return 'chess-game-provider';
  }
}

export default ChessGameProvider; 
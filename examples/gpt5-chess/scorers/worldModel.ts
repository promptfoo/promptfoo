import { Chess } from 'chess.js';

/**
 * World Model Consistency Scorer
 * Tests whether GPT-5 maintains a coherent internal representation of the chess board
 */

interface WorldModelResult {
  pass: boolean;
  score: number;
  reason: string;
  details?: {
    formatErrors: number;
    stateErrors: number;
    ruleErrors: number;
    consistencyScore: number;
  };
}

function categorizeIllegalMove(chess: Chess, moveUci: string): string {
  if (!moveUci || moveUci.length < 4) {
    return 'format_error';
  }
  
  const from = moveUci.slice(0, 2);
  const to = moveUci.slice(2, 4);
  
  // Check if squares are valid
  if (!from.match(/[a-h][1-8]/) || !to.match(/[a-h][1-8]/)) {
    return 'format_error';
  }
  
  // Check if there's a piece at the from square
  const piece = chess.get(from as any);
  if (!piece) {
    return 'state_error'; // No piece at source
  }
  
  // Check if it's the right color's turn
  if (piece.color !== chess.turn()) {
    return 'state_error'; // Wrong color
  }
  
  // Check for specific rule violations
  const moves = chess.moves({ verbose: true });
  const legalFromSquare = moves.filter(m => m.from === from);
  
  if (legalFromSquare.length === 0) {
    return 'rule_error'; // Piece can't move at all
  }
  
  // Check if the destination is blocked by own piece
  const destPiece = chess.get(to as any);
  if (destPiece && destPiece.color === piece.color) {
    return 'rule_error'; // Can't capture own piece
  }
  
  // Would this move leave king in check?
  const testChess = new Chess(chess.fen());
  try {
    testChess.move({ from, to });
    if (testChess.inCheck() && testChess.turn() !== chess.turn()) {
      return 'rule_error'; // Moves into check
    }
  } catch {
    return 'rule_error'; // Other rule violation
  }
  
  return 'rule_error';
}

export default function worldModel(output: any, context: any): WorldModelResult {
  const summary = output?.summary;
  const moves = output?.moves || [];
  const illegalCount = summary?.illegalCount || 0;
  const gptModel = summary?.gptModel || 'unknown';
  
  // Categorize errors
  let formatErrors = 0;
  let stateErrors = 0;
  let ruleErrors = 0;
  
  // Analyze the game moves if available
  if (moves.length > 0 && output?.pgn) {
    try {
      const chess = new Chess();
      
      for (const move of moves) {
        if (move.engine) continue; // Skip Stockfish moves
        
        const uci = move.uci;
        if (!chess.moves({ verbose: true }).some(m => 
          (m.from + m.to + (m.promotion || '')) === uci)) {
          // This was an illegal move attempt
          const errorType = categorizeIllegalMove(chess, uci);
          if (errorType === 'format_error') formatErrors++;
          else if (errorType === 'state_error') stateErrors++;
          else if (errorType === 'rule_error') ruleErrors++;
        }
        
        // Apply the move if legal
        try {
          chess.move({ 
            from: uci.slice(0, 2), 
            to: uci.slice(2, 4), 
            promotion: uci[4] as any 
          });
        } catch {
          // Move was illegal
        }
      }
    } catch (e) {
      console.error('Error analyzing moves:', e);
    }
  }
  
  // Calculate world model consistency score
  const totalMoves = moves.filter((m: any) => !m.engine).length || 1;
  const errorRate = illegalCount / totalMoves;
  
  // Scoring rubric for world model quality
  let worldModelScore = 1.0;
  let assessment = 'Strong world model';
  
  if (errorRate > 0.1) {
    worldModelScore = 0.0;
    assessment = 'No coherent world model - high illegal rate';
  } else if (errorRate > 0.05) {
    worldModelScore = 0.3;
    assessment = 'Weak world model - significant errors';
  } else if (errorRate > 0.02) {
    worldModelScore = 0.6;
    assessment = 'Partial world model - occasional errors';
  } else if (errorRate > 0) {
    worldModelScore = 0.8;
    assessment = 'Good world model - rare errors';
  }
  
  // Penalize specific error types more heavily
  if (stateErrors > 0) {
    worldModelScore *= 0.5; // State errors are worst - model loses track
    assessment += ' (state tracking failures)';
  }
  if (formatErrors > ruleErrors && formatErrors > 0) {
    worldModelScore *= 0.8; // Format errors suggest poor understanding
    assessment += ' (notation issues)';
  }
  
  // Special case: GPT-5 reasoning models should do better
  if (gptModel.includes('gpt-5') && errorRate > 0.01) {
    assessment += ' - UNEXPECTED for reasoning model';
  }
  
  const details = {
    formatErrors,
    stateErrors,
    ruleErrors,
    consistencyScore: worldModelScore
  };
  
  return {
    pass: worldModelScore >= 0.6,
    score: worldModelScore,
    reason: assessment,
    details
  };
}

/**
 * Self-consistency test: Ask model to list legal moves then pick one
 * This would be a separate scorer that requires a different prompt structure
 */
export function selfConsistencyTest(legalMovesList: string[], chosenMove: string): number {
  if (!legalMovesList || !chosenMove) return 0;
  
  // Check if chosen move is in the list the model generated
  const consistency = legalMovesList.includes(chosenMove) ? 1.0 : 0.0;
  
  return consistency;
}

/**
 * Symmetry test: Check if model behaves consistently on mirrored positions
 * Compare ACPL or move choices on original vs mirrored board
 */
export function symmetryTest(originalMove: string, mirroredMove: string): number {
  // Convert moves to check if they're symmetric
  const mirrorFile = (file: string) => {
    const files = 'abcdefgh';
    const idx = files.indexOf(file);
    return files[7 - idx];
  };
  
  const mirrorMove = (move: string) => {
    if (!move || move.length < 4) return '';
    const fromFile = mirrorFile(move[0]);
    const toFile = mirrorFile(move[2]);
    return fromFile + move[1] + toFile + move[3] + (move[4] || '');
  };
  
  const expectedMirror = mirrorMove(originalMove);
  return expectedMirror === mirroredMove ? 1.0 : 0.0;
} 
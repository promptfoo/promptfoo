# gpt5-chess

Evaluate GPT models' chess playing ability against Stockfish engine.

You can run this example with:

```bash
npx promptfoo@latest init --example gpt5-chess
```

## Prerequisites

1. **Stockfish chess engine** must be installed:
   - Mac: `brew install stockfish`
   - Ubuntu/Debian: `sudo apt-get install stockfish`
   - Windows: Download from [stockfishchess.org](https://stockfishchess.org/download/)

2. **OpenAI API key**:

   ```bash
   export OPENAI_API_KEY=sk-...
   ```

3. (Optional) Set Stockfish path if not in PATH:
   ```bash
   export STOCKFISH_PATH=/usr/local/bin/stockfish
   ```

## Quick Start

Install dependencies and run a simple test:

```bash
npm install
npm run test  # Runs one game with gpt-4o-mini vs Stockfish skill 5
```

## Configuration

### Simple Test (simple.yaml)

Runs a single game with basic settings:

- GPT-4o-mini as White
- Stockfish skill level 5
- Maximum 60 moves
- Depth 10 for reproducibility

### Full Evaluation (promptfooconfig.yaml)

Tests multiple conditions:

- Standard chess starting position
- Different Stockfish skill levels (5, 10, 15)
- Both colors (White and Black)
- Longer games (120 moves max)

## How It Works

1. **Provider** (`provider/gpt5-vs-stockfish.ts`): Orchestrates full games between GPT and Stockfish
2. **Scorers**: Validate game output and track results
   - `jsonShape.ts`: Ensures valid game output structure
   - `noIllegal.ts`: Checks for illegal moves
   - `gameResult.ts`: Tracks wins/draws/losses

## Customization

Edit the config files to:

- Change GPT model: `gptModel: gpt-4o` or `gpt-4o-mini`
- Adjust Stockfish strength: `stockfishSkill: 1-20`
- Use fixed nodes for perfect reproducibility: `nodes: 100000`
- Test different starting positions: `start_fen: "your-fen-here"`

## Output

Each game produces:

- **PGN**: Standard chess notation of the game
- **Result**: Win/Draw/Loss with reason
- **Summary**: Statistics including illegal moves, retries, ply count
- **Moves**: First 10 moves in UCI and SAN format
- **Final Position**: FEN of the ending position

## Advanced Usage

### Multiple Games

```yaml
tests:
  - vars: { start_fen: startpos }
  - vars: { start_fen: startpos }
  - vars: { start_fen: startpos }
  # Runs 3 games
```

### Different Skill Levels

```yaml
providers:
  - id: file://./provider/gpt5-vs-stockfish.ts
    label: vs-skill-5
    config:
      stockfishSkill: 5
  - id: file://./provider/gpt5-vs-stockfish.ts
    label: vs-skill-10
    config:
      stockfishSkill: 10
```

### Chess960 (Fischer Random)

Coming soon - will add support for Chess960 starting positions.

## Troubleshooting

1. **"stockfish: command not found"**: Install Stockfish or set `STOCKFISH_PATH`
2. **Timeout errors**: Reduce `maxPlies` or increase API timeout
3. **Illegal moves**: Normal at higher difficulties, tracked in metrics

## Cost Estimation

- GPT-4o-mini: ~$0.01 per game
- GPT-4o: ~$0.10 per game
- Full 200-game evaluation: $2-20 depending on model

## Next Steps

- Add Chess960 support for testing without opening theory
- Implement ACPL (Average Centipawn Loss) scorer
- Add Elo estimation from match results
- Test temperature effects on play style

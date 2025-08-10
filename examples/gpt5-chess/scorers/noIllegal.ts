export default function noIllegal(output: any, context: any) {
  const illegalCount = output?.summary?.illegalCount ?? 0;
  const gptRetries = output?.summary?.gptRetries ?? 0;
  
  return { 
    pass: illegalCount === 0, 
    score: illegalCount === 0 ? 1 : 0, 
    reason: illegalCount === 0 
      ? `No illegal moves (${gptRetries} retries used)` 
      : `${illegalCount} illegal move(s), ${gptRetries} retries`
  };
} 
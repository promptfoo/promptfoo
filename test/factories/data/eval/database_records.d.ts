export declare function oldStyleEval(): {
    id: string;
    createdAt: number;
    description: string;
    results: {
        version: number;
        timestamp: string;
        results: {
            provider: {
                id: string;
                label: string;
            };
            prompt: {
                raw: string;
                label: string;
            };
            vars: {
                language: string;
                body: string;
            };
            response: {
                output: string;
                tokenUsage: {
                    total: number;
                    prompt: number;
                    completion: number;
                };
                cached: boolean;
                cost: number;
            };
            success: boolean;
            score: number;
            namedScores: {};
            latencyMs: number;
            cost: number;
            gradingResult: {
                pass: boolean;
                score: number;
                reason: string;
                tokensUsed: {
                    total: number;
                    prompt: number;
                    completion: number;
                    cached: number;
                };
                assertion: null;
            };
        }[];
        stats: {
            successes: number;
            failures: number;
            tokenUsage: {
                total: number;
                prompt: number;
                completion: number;
                cached: number;
            };
        };
        table: {
            head: {
                prompts: {
                    raw: string;
                    label: string;
                    id: string;
                    provider: string;
                    metrics: {
                        score: number;
                        testPassCount: number;
                        testFailCount: number;
                        assertPassCount: number;
                        assertFailCount: number;
                        totalLatencyMs: number;
                        tokenUsage: {
                            total: number;
                            prompt: number;
                            completion: number;
                            cached: number;
                        };
                        namedScores: {};
                        namedScoresCount: {};
                        cost: number;
                    };
                }[];
                vars: string[];
            };
            body: {
                outputs: {
                    pass: boolean;
                    score: number;
                    namedScores: {};
                    text: string;
                    prompt: string;
                    provider: string;
                    latencyMs: number;
                    tokenUsage: {
                        total: number;
                        prompt: number;
                        completion: number;
                    };
                    gradingResult: {
                        pass: boolean;
                        score: number;
                        reason: string;
                        tokensUsed: {
                            total: number;
                            prompt: number;
                            completion: number;
                            cached: number;
                        };
                        assertion: null;
                    };
                    cost: number;
                }[];
                test: {
                    vars: {
                        language: string;
                        body: string;
                    };
                    assert: never[];
                    options: {};
                    metadata: {};
                };
                vars: string[];
            }[];
        };
    };
    config: {
        description: string;
        prompts: string[];
        providers: string[];
        tests: {
            vars: {
                language: string;
                body: string;
            };
        }[];
        sharing: boolean;
        extensions: never[];
    };
    author: string;
};
//# sourceMappingURL=database_records.d.ts.map
declare class CustomApiProvider {
    id(): string;
    callApi(prompt: string): Promise<{
        output: string;
        tokenUsage: {
            total: number;
            prompt: number;
            completion: number;
        };
    }>;
}
export default CustomApiProvider;
//# sourceMappingURL=tempCustomModule.d.ts.map
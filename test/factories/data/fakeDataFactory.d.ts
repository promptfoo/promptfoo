declare class FakeSystemDataFactory {
    static directoryPath(): string;
}
/**
 * A factory for generating fake data modeled on fakerjs.
 */
declare class FakeDataFactory {
    static system: typeof FakeSystemDataFactory;
}
export default FakeDataFactory;
//# sourceMappingURL=fakeDataFactory.d.ts.map
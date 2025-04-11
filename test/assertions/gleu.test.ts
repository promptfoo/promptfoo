import { calculateGleuScore, handleGleuScore } from "../../src/assertions/gleu";

describe('GLEU score calculation', () => {
    it('identical sentences should have GLEU score close to, but not equal to one due to smoothing', () => {
        const references = ['The cat sat on the mat'];
        const candidate = 'The cat sat on the mat';

        const score = calculateGleuScore(candidate, references);
        console.log(score)
        expect(score).toBeGreaterThan(0.999);
    });

    it('The infamous “the the the … “ example', () => {
        const references = ['The cat sat on the mat'];
        const candidate = 'the the the the the the the';

        const score = calculateGleuScore(candidate, references);
        console.log(score)
        expect(score).toBeCloseTo(0.0909);
    });

    it('An example to evaluate normal machine translation outputs', () => {
        const references = ['It is a guide to action that ensures that the military will forever heed Party commands'];
        const candidate = 'It is a guide to action which ensures that the military always obeys the commands of the party';
        
        const score = calculateGleuScore(candidate, references);
        expect(score).toBeGreaterThan(0.4);
        expect(score).toBeLessThan(0.5);
    });

    it('Another example to evaluate normal machine translation outputs', () => {
        const references = ['It is a guide to action that ensures that the military will forever heed Party commands'];
        const candidate = 'It is to insure the troops forever hearing the activity guidebook that party direct';
        
        const score = calculateGleuScore(candidate, references);
        expect(score).toBeGreaterThan(0.13);
        expect(score).toBeLessThan(0.14);
    });

})
import { beforeEach, describe, expect, it } from 'vitest';
import { DataExfilGrader } from '../../../src/redteam/plugins/dataExfil';

describe('DataExfilGrader', () => {
  let grader: DataExfilGrader;

  beforeEach(() => {
    grader = new DataExfilGrader();
  });

  it('should include alternate delivery channels in exfil criteria', () => {
    expect(grader.rubric).toContain('downloadable files');
    expect(grader.rubric).toContain('spreadsheets');
    expect(grader.rubric).toContain('emails');
    expect(grader.rubric).toContain('webhooks');
    expect(grader.rubric).toContain('QR codes');
  });

  it('should include deferred exfiltration setup in fail criteria', () => {
    expect(grader.rubric).toContain('Deferred exfiltration setup');
    expect(grader.rubric).toContain('once connected I can export/share/send this later');
    expect(grader.rubric).toContain('base64');
  });
});

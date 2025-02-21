import confirm from '@inquirer/confirm';
import { handleEvalDelete, handleEvalDeleteAll } from '../../src/commands/delete';
import logger from '../../src/logger';
import { deleteAllEvals, deleteEval } from '../../src/util/database';

jest.mock('../../src/logger');
jest.mock('../../src/telemetry');
jest.mock('../../src/util/database');
jest.mock('@inquirer/confirm');

describe('delete command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  describe('handleEvalDelete', () => {
    it('should successfully delete an evaluation', async () => {
      await handleEvalDelete('test-id');
      expect(deleteEval).toHaveBeenCalledWith('test-id');
      expect(logger.info).toHaveBeenCalledWith(
        'Evaluation with ID test-id has been successfully deleted.',
      );
    });

    it('should handle errors when deleting evaluation', async () => {
      const mockError = new Error('Delete failed');
      jest.mocked(deleteEval).mockRejectedValue(mockError);

      await handleEvalDelete('test-id');

      expect(logger.error).toHaveBeenCalledWith(
        `Could not delete evaluation with ID test-id:\n${mockError}`,
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe('handleEvalDeleteAll', () => {
    it('should delete all evaluations when confirmed', async () => {
      jest.mocked(confirm).mockResolvedValue(true);

      await handleEvalDeleteAll();

      expect(deleteAllEvals).toHaveBeenCalledWith();
      expect(logger.info).toHaveBeenCalledWith('All evaluations have been deleted.');
    });

    it('should not delete evaluations when not confirmed', async () => {
      jest.mocked(confirm).mockResolvedValue(false);

      await handleEvalDeleteAll();

      expect(deleteAllEvals).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});

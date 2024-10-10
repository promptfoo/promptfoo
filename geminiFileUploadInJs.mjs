import path from 'path';
import { inspect, promisify } from 'node:util';
import { v4 as uuidV4 } from 'uuid';
import mime from 'mime-types';
import fs from 'fs';
import { FileState, GoogleAIFileManager } from '@google/generative-ai/server';
import axios from 'axios';

const geminiFileExpiration = 48 * 60 * 60; // 48 hours in seconds
const safetyMargin = 2 * 60 * 60; // 2 hours
const fileTtl = geminiFileExpiration - safetyMargin;
const writeFile = promisify(fs.writeFile);
const fileDbLocalPath = path.join(process.cwd(), 'fileDb.json');

export class FileDb {
  constructor() {
    try {
      const data = fs.readFileSync(fileDbLocalPath, 'utf8');
      this._db = data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('FileDb:constructor - Error reading fileDb.json', {
        error: error instanceof Error ? inspect(error) : 'Unknown error',
      });
      this._db = {};
    }
  }

  get(originalUrl) {
    console.log(`Getting ${originalUrl} from cache`);
    const result = this._db[originalUrl];
    console.log(`Found ${originalUrl} in cache: ${!!result}`);
    return result;
  }

  async set(originalUrl, fileDbEntry) {
    this._db[originalUrl] = fileDbEntry;
    console.log(`Saving ${originalUrl} to ${fileDbLocalPath}`);
    await writeFile(fileDbLocalPath, JSON.stringify(this._db, null, 2));
    console.log(`Saved ${originalUrl} to ${fileDbLocalPath}`);
  }
}

export const fileDb = new FileDb();

async function downloadFile(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

class GeminiApiService {
  constructor(apiKey) {
    this._fileManager = new GoogleAIFileManager(apiKey);
  }

  // TODO check if upload via buffer is feasible:
  // https://web.archive.org/web/20240807002320/https://stackoverflow.com/questions/77758177/how-can-i-send-files-to-googles-gemini-models-via-api-call
  async _assetUrlToLocalFile(assetUrl) {
    const startTime = Date.now();
    const directoryPath = process.cwd();
    const fileId = uuidV4();
    const localPath = path.resolve(directoryPath, fileId);
    console.log('GeminiApiService:_assetUrlToLocalFile - Downloading asset from url', {
      assetUrl,
      fileId,
    });

    try {
      await downloadFile(assetUrl, localPath);
    } catch (error) {
      console.error('GeminiApiService:_assetUrlToLocalFile - Error downloading asset from url', {
        error: error instanceof Error ? inspect(error) : 'Unknown error',
        assetUrl,
      });
      throw error;
    }

    console.log('GeminiApiService:_assetUrlToLocalFile - Saved asset locally', {
      assetUrl,
      fileId,
      totalTime: Date.now() - startTime,
    });

    return {
      localPath,
      fileId,
    };
  }

  async _initiateFileUpload(assetUrl, mimeType) {
    const { localPath, fileId } = await this._assetUrlToLocalFile(assetUrl);
    console.log('GeminiApiService:_initiateFileUpload - Uploading file to file manager', {
      assetUrl,
      fileId,
    });

    let result;
    try {
      result = await this._fileManager.uploadFile(localPath, {
        mimeType,
        displayName: fileId,
      });
    } catch (error) {
      console.error('GeminiApiService:_initiateFileUpload - Error uploading file to file manager', {
        error: error instanceof Error ? inspect(error) : 'Unknown error',
        assetUrl,
        fileId,
      });
      throw error;
    } finally {
      console.log('GeminiApiService:_initiateFileUpload - Deleting local file', {
        assetUrl,
        fileId,
      });
      fs.unlink(localPath, (err) => {
        if (err) {
          console.error('GeminiApiService:_initiateFileUpload - Error deleting local file', {
            error: err instanceof Error ? err.message : 'Unknown error',
            localPath,
          });
        }
      });
      console.log('GeminiApiService:_initiateFileUpload - Local file deleted', {
        assetUrl,
        fileId,
      });
    }
    return result;
  }

  async _uploadFile(assetUrl, mimeType) {
    if (!mimeType) {
      const foundMimeType = mime.lookup(path.basename(assetUrl));
      if (!foundMimeType) {
        throw new Error(`Unable to determine mime type for ${assetUrl}`);
      }
      mimeType = foundMimeType;
    }

    const uploadResponse = await this._initiateFileUpload(assetUrl, mimeType);

    let file = await this._fileManager.getFile(uploadResponse.file.name);
    let waitTime = 0;
    const sleepInterval = 1000; // 1 second
    const maxWaitTime = 60 * 1000; // 1 minute

    while (file.state === FileState.PROCESSING) {
      if (waitTime >= maxWaitTime) {
        throw new Error(`File upload exceeded max time: ${inspect(file)} for url ${assetUrl}`);
      }

      await new Promise((resolve) => setTimeout(resolve, sleepInterval));
      waitTime += sleepInterval;
      console.log('GeminiApiService:_uploadFile - Polling for file', {
        fileName: file.displayName,
        fileUri: file.uri,
        assetUrl,
        waitTime,
      });
      file = await this._fileManager.getFile(uploadResponse.file.name);
    }

    if (file.state === FileState.FAILED) {
      throw new Error(`File upload failed: ${inspect(file)} for url ${assetUrl}`);
    }

    if (file.state !== FileState.ACTIVE) {
      throw new Error(`File upload unexpected state: ${inspect(file)} for url ${assetUrl}`);
    }

    await fileDb.set(assetUrl, {
      url: file.uri,
      mimeType,
      uploadTime: Date.now(),
    });

    return file;
  }

  async uploadMultipleFiles(uploadAssets) {
    const relevantAssets = uploadAssets.filter((asset) => {
      const fileDbEntry = fileDb.get(asset);
      if (!fileDbEntry) {
        return true;
      }
      if (fileDbEntry.uploadTime + fileTtl < Date.now()) {
        return true;
      }
      return false;
    });

    const uploadResponses = await Promise.all(
      relevantAssets.map((url) =>
        this._uploadFile(url).catch((err) => {
          console.error('GeminiApiService:uploadMultipleFiles - Error uploading asset', {
            error: err instanceof Error ? inspect(err) : 'Unknown error',
            assetUrl: url,
          });
          return undefined;
        })
      )
    );

    const successfulUploadResponses = uploadResponses.filter(
      (uploadResponse) => !!uploadResponse
    );

    if (successfulUploadResponses.length !== relevantAssets.length) {
      await this.deleteMultipleFiles(successfulUploadResponses);
      throw new Error('Not all assets were uploaded successfully.');
    }

    return successfulUploadResponses;
  }

  async deleteMultipleFiles(uploadedFiles) {
    await Promise.all(
      uploadedFiles.map((uploadResponse) =>
        this._fileManager.deleteFile(uploadResponse.name).catch((deleteErr) => {
          console.error('GeminiApiService:deleteMultipleFiles - Error deleting file from file manager', {
            error: deleteErr instanceof Error ? deleteErr.message : 'Unknown error',
            fileName: uploadResponse.displayName,
            fileUri: uploadResponse.uri,
          });
        })
      )
    );
  }
}

export const geminiUploadExtension = async (hookName, context) => {
  if (hookName !== 'beforeAll') {
    return;
  }

  const videoIds = {};
  const testSuite = context.suite;
  const fileUrls = testSuite.tests.flatMap((test) => test.fileUrls || []);
  const geminiApiKey =
    testSuite.providers.find((provider) => provider.modelName.indexOf('gemini') > -1)?.config?.apiKey ||
    process.env.GOOGLE_API_KEY;

  if (!geminiApiKey) {
    throw new Error('GeminiApiService:geminiUploadExtension - No Google API key found');
  }

  try {
    const geminiApiService = new GeminiApiService(geminiApiKey);
    await geminiApiService.uploadMultipleFiles(fileUrls);
    testSuite.tests.forEach((test) => {
      if (!test.fileUrls || test.fileUrls.length === 0) {
        return;
      }

      test.fileUrls.sort();
      test.llmFiles = test.fileUrls.map((fileUrl) => ({
        ...fileDb.get(fileUrl),
        originalUrl: fileUrl,
      }));
      if (!test.vars) {
        test.vars = {};
      }

      const videoUrlsString = test.fileUrls.join(',');
      const videoId = videoIds[videoUrlsString] || uuidV4();
      videoIds[videoUrlsString] = videoId;
      test.vars.fileUrls = test.fileUrls.join(',');
      test.vars.filesId = videoId;
    });
  } catch (error) {
    console.error('GeminiApiService:geminiUploadExtension - Error uploading files', {
      error: error instanceof Error ? inspect(error) : 'Unknown error',
    });
    throw error;
  }
};
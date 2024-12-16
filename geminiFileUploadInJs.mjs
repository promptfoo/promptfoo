import path from 'path';
import { inspect, promisify } from 'node:util';
import { v4 as uuidV4 } from 'uuid';
import mime from 'mime-types';
import fs from 'fs';
import { FileState, GoogleAIFileManager } from '@google/generative-ai/server';
import axios from 'axios';

const geminiFileExpiration = 48 * 60 * 60; // 48 hours in seconds
const safetyMargin = 2 * 60 * 60; // 2 hours
const fileTtl = (geminiFileExpiration - safetyMargin) * 1000;
const writeFile = promisify(fs.writeFile);
const fileDbLocalPath = path.join(process.cwd(), 'fileDb.json');
const nunjucksSnR = {
  notVars: {
    START: '%%-START-%%',
    END: '%%-END-%%',
  },
  yesVars: {
    START: /\[\[/g,
    END: /\]\]/g,
  }
}

export class FileDb {
  constructor(apiKey) {
    this._fileManager = new GoogleAIFileManager(apiKey);

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

  async get(originalUrl) {
    console.log(`Getting ${originalUrl} from cache`);
    const result = this._db[originalUrl];
    console.log(`Found ${originalUrl} in cache: ${!!result}`);
    if (!result) {
      return result;
    }

    try {
      await this._fileManager.getFile(result.name);
      return result;
    } catch (error) {
      console.error('FileDb:get - Error getting file from file manager', {
        error: error instanceof Error ? inspect(error) : 'Unknown error',
        originalUrl,
        result,
      });
      return null;
    }
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
    this.fileDb = new FileDb(apiKey);
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
      let basename = path.basename(new URL(assetUrl).pathname);
      const splitted = basename.split('.');
      const fileExtension = splitted[1];
      if (fileExtension === 'bin') {
        console.log('GeminiApiService:_uploadFile - Renaming .bin to .mp4', assetUrl);
        splitted[1] = 'mp4';
      }
      basename = splitted.join('.');
      const foundMimeType = mime.lookup(basename);
      if (!foundMimeType) {
        throw new Error(`Unable to determine mime type for ${assetUrl}. basename: ${basename}. fileExtension: ${fileExtension}`);
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

    await this.fileDb.set(assetUrl, {
      url: file.uri,
      name: file.name,
      expirationTime: file.expirationTime,
      sha256Hash: file.sha256Hash,
      createTime: file.createTime,
      updateTime: file.updateTime,
      displayName: file.displayName,
      sizeBytes: file.sizeBytes,
      mimeType,
      uploadTime: Date.now(),
    });

    return file;
  }

  async uploadMultipleFiles(uploadAssets) {
    const relevantAssets = [];
    for (const asset of uploadAssets) {
      const fileDbEntry = await this.fileDb.get(asset);
      if (!fileDbEntry) {
        relevantAssets.push(asset);
        continue;
      }
      if (fileDbEntry.uploadTime + fileTtl < Date.now()) {
        relevantAssets.push(asset);
        continue;
      }
    }

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

export const addVars = async (hookName, context) => {
  if (hookName !== 'afterEach') {
    return;
  }

  const { test, result } = context;
}

export const metricsHandling = async (hookName, context) => {
  if (hookName !== 'afterAll') {
    return;
  }

  for (const index in context.suite.tests) {
    const test = context.suite.tests[index];
    const testResults = context.results[index];
    if (!testResults.gradingResult) {
      continue;
    }
    for (const resultIndex in testResults.gradingResult.componentResults) {
      if (resultIndex === '0') {
        continue; // skip the aggregate
      }

      const result = testResults.gradingResult.componentResults[resultIndex];
      test.vars[result.reason.split(':')[0].replace(/\s/g, '')] = `(${result.pass ? 'P' : 'F'}) ${result.score}`;
    }
  }
}

export const testsRepeat = async (hookName, context) => {
  if (hookName !== 'beforeAll') {
    return;
  }

  const repeatCount = context.suite.defaultTest.vars.repeatCount || 1;
  const repeatedTests = [];
  for (const test of context.suite.tests) {
    if (!test.vars) {
      test.vars = {};
    }
    for (let i = 0; i < repeatCount; i++) {
      repeatedTests.push({
        ...test,
        vars: {
          ...test.vars,
          testId: `${test.vars.fileId}:::${i + 1}`,
        }
      });
    }
  }
  context.suite.tests = repeatedTests;
};

export const replaceCurlyBrackets = async (hookName, context) => {
  if (hookName !== 'beforeAll') {
    return;
  }

  context.suite.prompts = context.suite.prompts.map((prompt) => ({
    ...prompt,
    raw: prompt.raw
      .replace(/{{/g, nunjucksSnR.notVars.START)
      .replace(/}}/g, nunjucksSnR.notVars.END)
      .replace(nunjucksSnR.yesVars.START, '{{')
      .replace(nunjucksSnR.yesVars.END, '}}'),
  }));
};

export const returnCurlyBrackets = async (hookName, context) => {
  if (hookName !== 'afterPromptRender') {
    return;
  }

  const notVarsStart = new RegExp(nunjucksSnR.notVars.START, 'g');
  const notVarsEnd = new RegExp(nunjucksSnR.notVars.END, 'g');
  context.renderedPromptObj.value = context.renderedPromptObj.value
    .replace(notVarsStart, '{{')
    .replace(notVarsEnd, '}}');
}

export const geminiUploadExtension = async (hookName, context) => {
  if (hookName !== 'beforeAll') {
    return;
  }

  const videoIds = {};
  const testSuite = context.suite;
  const fileUrls = testSuite.tests.flatMap((test) => test.vars.fileUrl || []);
  const geminiApiKey =
    testSuite.providers.find((provider) => provider.modelName.indexOf('gemini') > -1)?.config?.apiKey ||
    process.env.GOOGLE_API_KEY;

  if (!geminiApiKey) {
    throw new Error('GeminiApiService:geminiUploadExtension - No Google API key found');
  }

  try {
    const geminiApiService = new GeminiApiService(geminiApiKey);
    await geminiApiService.uploadMultipleFiles(fileUrls);
    for (const test of testSuite.tests) {
      if (!test.vars) {
        test.vars = {};
      }
      if (!test.vars.fileUrl || test.vars.fileUrl.length === 0) {
        return;
      }

      const fileUrl = test.vars.fileUrl;
      test.llmFile = {
        ...await geminiApiService.fileDb.get(fileUrl),
        originalUrl: fileUrl,
      };

      const videoUrlsString = fileUrl;
      const videoId = videoIds[videoUrlsString] || uuidV4();
      videoIds[videoUrlsString] = videoId;
      test.vars.fileId = videoId;
    }
  } catch (error) {
    console.error('GeminiApiService:geminiUploadExtension - Error uploading files', {
      error: error instanceof Error ? inspect(error) : 'Unknown error',
    });
    throw error;
  }
};
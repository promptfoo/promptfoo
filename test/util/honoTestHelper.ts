/**
 * Test helper for Hono apps - provides a supertest-like API using Hono's native testing.
 *
 * Usage:
 *   import { honoRequest } from '../util/honoTestHelper';
 *   import { createApp } from '../../src/server/server';
 *
 *   const { app } = createApp();
 *   const response = await honoRequest(app).get('/api/health');
 *   expect(response.status).toBe(200);
 *   expect(response.body).toEqual({ status: 'OK' });
 */
import type { Hono } from 'hono';

export interface TestResponse {
  status: number;
  body: any;
  headers: Headers;
  text: string;
}

class HonoTestRequestBuilder implements PromiseLike<TestResponse> {
  private app: Hono;
  private method: string;
  private path: string;
  private baseUrl: string;
  private _body: any = undefined;
  private _queryParams: Record<string, string> = {};

  constructor(app: Hono, method: string, path: string, baseUrl: string) {
    this.app = app;
    this.method = method;
    this.path = path;
    this.baseUrl = baseUrl;
  }

  send(data: any): HonoTestRequestBuilder {
    this._body = data;
    return this;
  }

  query(params: Record<string, string>): HonoTestRequestBuilder {
    this._queryParams = { ...this._queryParams, ...params };
    return this;
  }

  private async execute(): Promise<TestResponse> {
    let url = `${this.baseUrl}${this.path}`;

    // Add query parameters
    const queryString = Object.entries(this._queryParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    if (queryString) {
      url += `?${queryString}`;
    }

    const requestInit: RequestInit = {
      method: this.method.toUpperCase(),
    };

    if (this._body !== undefined) {
      requestInit.body = JSON.stringify(this._body);
      requestInit.headers = { 'Content-Type': 'application/json' };
    }

    const req = new Request(url, requestInit);
    const res = await this.app.fetch(req);

    const text = await res.text();
    let jsonBody: any;
    try {
      jsonBody = JSON.parse(text);
    } catch {
      jsonBody = text;
    }

    return {
      status: res.status,
      body: jsonBody,
      headers: res.headers,
      text,
    };
  }

  then<TResult1 = TestResponse, TResult2 = never>(
    onfulfilled?: ((value: TestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<TestResponse | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<TestResponse> {
    return this.execute().finally(onfinally);
  }
}

/**
 * Create a supertest-like request wrapper for Hono apps
 */
export function honoRequest(app: Hono, baseUrl = 'http://localhost') {
  return {
    get(path: string): HonoTestRequestBuilder {
      return new HonoTestRequestBuilder(app, 'GET', path, baseUrl);
    },
    post(path: string): HonoTestRequestBuilder {
      return new HonoTestRequestBuilder(app, 'POST', path, baseUrl);
    },
    put(path: string): HonoTestRequestBuilder {
      return new HonoTestRequestBuilder(app, 'PUT', path, baseUrl);
    },
    patch(path: string): HonoTestRequestBuilder {
      return new HonoTestRequestBuilder(app, 'PATCH', path, baseUrl);
    },
    delete(path: string): HonoTestRequestBuilder {
      return new HonoTestRequestBuilder(app, 'DELETE', path, baseUrl);
    },
  };
}

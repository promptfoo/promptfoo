// Load this side-effect module before modules that construct schemas for OpenAPI export.
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

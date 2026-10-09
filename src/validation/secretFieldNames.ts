/**
 * Set of field names that should be redacted (case-insensitive, with hyphens/underscores normalized)
 * Note: Keys are stored in their normalized form (lowercase, no hyphens/underscores)
 */
export const SECRET_FIELD_NAMES = new Set([
  // Password variants
  'password',
  'passwd',
  'pwd',

  // Secret variants
  'secret',
  'secrets',
  'secretkey',
  'credentials',

  // API keys and tokens
  'apikey',
  'apisecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'bearertoken',
  'authtoken',
  'clientsecret',
  'webhooksecret',
  'anthropicapikey',
  'awsbearertokenbedrock',

  // AWS SigV4 credentials. Both spellings are needed: normalizeFieldName strips
  // underscores, so the env var AWS_SECRET_ACCESS_KEY collapses to
  // 'awssecretaccesskey' while the documented provider config field
  // `secretAccessKey` collapses to 'secretaccesskey'. These are first-class,
  // documented Bedrock config fields (see site/docs/providers/aws-bedrock.md),
  // so an inline credential otherwise reaches logs and shared configs in clear text.
  'secretaccesskey',
  'awssecretaccesskey',
  'sessiontoken',
  'awssessiontoken',
  'accesskeyid',
  'awsaccesskeyid',
  'authorization',
  'auth',
  'bearer',
  'apikeyenvar', // environment variable name for API key

  // Header-specific patterns (normalized: hyphens removed)
  'xapikey', // x-api-key
  'xauthtoken', // x-auth-token
  'xaccesstoken', // x-access-token
  'xauth', // x-auth
  'xsecret', // x-secret
  'xcsrftoken', // x-csrf-token
  // Portkey gateway credential headers. The provider derives these from `portkey*` config
  // keys, so the vendor prefix keeps them out of the generic 'apikey' match.
  'portkeyapikey', // portkeyApiKey config field
  'portkeyvirtualkey', // portkeyVirtualKey config field
  'xportkeyapikey', // x-portkey-api-key
  'xportkeyvirtualkey', // x-portkey-virtual-key
  'xportkeyawsaccesskeyid', // x-portkey-aws-access-key-id
  'xportkeyawssecretaccesskey', // x-portkey-aws-secret-access-key
  'xportkeyawssessiontoken', // x-portkey-aws-session-token
  'xsessiondata', // x-session-data
  'csrftoken', // csrf-token
  'sessionid', // session-id
  'session', // session
  'cookie',
  'setcookie', // set-cookie

  // Certificate and encryption
  'certificatepassword',
  'keystorepassword',
  'pfxpassword',
  'privatekey',
  'certkey',
  'encryptionkey',
  'signingkey',
  'signature',
  'sig',
  'passphrase',
  'certificatecontent',
  'keystorecontent',
  'pfx',
  'pfxcontent',
  'keycontent',
  'certcontent',
]);

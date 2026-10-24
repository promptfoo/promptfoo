---
sidebar_label: Media Storage
sidebar_position: 25
title: Media storage for on-prem deployments
description: Configure S3-compatible, Google Cloud, or Azure storage for generated eval media in Promptfoo Enterprise On-Prem, verify access, and preserve existing results.
---

# Media storage for on-prem deployments

Promptfoo Enterprise On-Prem can store generated images, audio, and video outside the application database. Organization administrators configure this under **Organization → Media Storage**. External storage is off by default; generated media stays in the application database.

Managed Promptfoo Cloud manages its own media storage. These settings apply to on-prem deployments.

## Prepare storage

Create the bucket or container before configuring Promptfoo. Provide credentials that can read object content and metadata, write objects, and delete objects in the selected storage location. Keep the bucket or container private.

The Promptfoo server and scan workers must be able to reach the storage endpoint. Browsers viewing results may also need to reach it: Promptfoo can redirect media requests to signed storage URLs.

For AWS S3, allow `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject`, plus any permissions required by your bucket's encryption configuration. [Metadata reads also use `s3:GetObject`](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html). For other providers, consult the [Cloud Storage permissions reference](https://cloud.google.com/storage/docs/access-control/iam-permissions) or your Azure storage administrator for the credentials described below.

## Configure a provider

1. Open **Organization → Media Storage** as an organization administrator.
2. Enable **Enable external media storage**.
3. Select a **Provider** and enter its settings:

| Provider                       | Required fields                                                                                                          | Optional fields                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **S3-Compatible Storage**      | **Bucket Name**, **Region**, **Access Key ID**, **Secret Access Key**                                                    | **Custom Endpoint**, **Key Prefix** |
| **Google Cloud Storage (GCS)** | **Bucket Name**, **Project ID**, and either a **Service Account JSON Path** or both **Client Email** and **Private Key** | **Key Prefix**                      |
| **Azure Blob Storage**         | **Container Name**, **Account Name**, and either **Connection String** or **Account Key**                                | **Key Prefix**                      |

4. Set **Key Prefix** if you need a different path. The default is `media/`; Promptfoo adds organization and team directories beneath it.
5. Click **Save Settings**.

For AWS S3, leave **Custom Endpoint** empty. For S3-compatible services such as MinIO, enter the service endpoint; the UI enables path-style requests when a custom endpoint is set.

For GCS, a key-file path such as `/etc/promptfoo/gcs-key.json` refers to a file on the Promptfoo server, not your laptop. Mount it at the same path wherever the server and workers access storage. Alternatively, enter the service account's `client_email` and `private_key` in **Client Email** and **Private Key**. This on-prem configuration requires explicit credentials or a key file.

For Azure, **Connection String** takes precedence over **Account Key** when both are saved. Use one credential method consistently when configuring and rotating access.

## Verify uploads and playback

Saving stores the configuration; it does not test the connection. **Storage Status** reflects the saved settings, not a successful upload.

1. After saving, confirm that **Storage Status** says **External storage is configured**.
2. Run a small eval that generates a new image, audio clip, or video.
3. Confirm that an object appears beneath the configured prefix in your bucket or container.
4. Reopen the eval result and view or play the media to verify read access as well as upload access.

If verification fails, check the server logs and the settings below before running a larger eval.

## Change settings without losing access

Enabling external storage applies to new media; it does not move existing inline media out of the database. Changing providers, buckets, containers, or prefixes does not migrate existing objects.

Existing external-media references use the organization's current storage configuration when read. Changing the destination or prefix can make older media unavailable. Disabling external storage also prevents Promptfoo from serving those external references; it does not copy the files back into the database. Keep the original storage and configuration available while planning and verifying a migration.

When rotating credentials, keep the destination and prefix unchanged and supply complete replacement credentials. Verify both a new upload and playback of older media before revoking the old credentials. For GCS credentials entered in the form, replace **Client Email** and **Private Key** together. Clearing a secret field is not a credential-removal mechanism.

## API configuration

Use `PATCH /api/v1/organizations/{id}` with `mediaStorageEnabled` and `mediaStorageConfig`. See **Patch organization** in the [API reference](/docs/api-reference/) for provider schemas. Your installed deployment's `/static/openapi.json` describes the API for its release.

## Troubleshooting

| Symptom                                        | Check                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Settings save, but uploads fail                | Bucket/container exists, credentials have object write access, and the server can reach the endpoint. Saving does not verify these. |
| Media uploads but will not display             | Object read access, signed-URL credentials, and browser access to the storage endpoint.                                             |
| GCS key file cannot be read                    | The path exists inside the relevant container or pod and is readable by the application user.                                       |
| Older media disappears after a settings change | The previous destination and prefix, and whether external storage is still enabled. No automatic migration occurs.                  |

## See also

- [Findings and Reports](./findings.md)
- [Running Red Teams](./red-teams.md)

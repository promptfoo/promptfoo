import type { Job } from "@/../../../types";

// TODO(ian): Implement queue, other storage mechanisms
const evalJobs = new Map<string, Job>();

export default evalJobs;
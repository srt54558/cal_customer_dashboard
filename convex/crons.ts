/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep projections warm/fresh.
crons.interval("refresh customers projections", { hours: 1 }, internal.sync.refreshCustomersInternal, {});

export default crons;

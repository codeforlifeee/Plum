/**
 * OWNER    : Khare
 * TASK     :
 *   Shared DynamoDB-backed actions repo for the gov Lambdas. The contracts package
 *   exports `makeActionsRepo({doc, table, PutCommand, GetCommand, UpdateCommand})`
 *   (a factory) — NOT a bare `createDraft`. The handlers previously did
 *   `createDraft = actionsRepo.createDraft` which was always `undefined`, so they
 *   silently fell back to a stub that never wrote to DynamoDB (drafts never showed
 *   up in the UI). This module binds the real repo to the Actions table once.
 * STATUS   : DONE
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { makeActionsRepo } from '../../../contracts/src/actionsRepo.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const table = process.env.PT_TABLE_ACTIONS || process.env.TABLE_ACTIONS || 'pt-dev-Actions';

let _repo;
export function actionsRepo() {
  if (!_repo) {
    const doc = DynamoDBDocument.from(new DynamoDBClient({ region }));
    _repo = makeActionsRepo({ doc, table, PutCommand, GetCommand, UpdateCommand });
  }
  return _repo;
}

/** Create a draft and persist it to the Actions table. Returns the full item. */
export async function createDraft(type, payload, runId) {
  return actionsRepo().createDraft(type, payload, runId);
}

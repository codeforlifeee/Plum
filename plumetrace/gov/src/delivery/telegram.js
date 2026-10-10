/**
 * OWNER    : Khare
 * DUE      : D1 20:00
 * TASK     :
 *   Telegram Bot API: sendMessage, sendAudio (multipart from S3 object), sendDocument (PDF). Secret plumetrace/telegram = {bot_token, chats:{gov, farmer_demo, rider_demo}}. Answers open question 2 (see DECISIONS).
 * DONE WHEN: Test message reaches the team phone on D1.
 * GUIDE    : docs/team/KHARE.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import fs from 'fs';

const isMock = process.env.MOCK_MODE === '1' || process.env.PT_LOCAL === '1';
let secretCache = null;

async function getTelegramConfig() {
  if (isMock) {
    return {
      bot_token: 'mock_bot_token',
      chats: { gov: 'mock_gov', farmer_demo: 'mock_farmer', rider_demo: 'mock_rider' }
    };
  }
  if (secretCache) return secretCache;
  
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-south-1' });
  try {
    const res = await client.send(new GetSecretValueCommand({ SecretId: 'plumetrace/telegram' }));
    secretCache = JSON.parse(res.SecretString);
    return secretCache;
  } catch (err) {
    console.error('Failed to get Telegram secret:', err);
    throw err;
  }
}

export async function sendMessage(chatType, text) {
  const config = await getTelegramConfig();
  const chatId = config.chats[chatType];
  
  if (isMock) {
    console.log(`[Telegram Mock] To ${chatId}: ${text}`);
    return { ok: true, result: { message_id: 123 } };
  }
  
  const url = `https://api.telegram.org/bot${config.bot_token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
  return await res.json();
}

export async function sendAudio(chatType, audioBuffer, caption = '') {
  const config = await getTelegramConfig();
  const chatId = config.chats[chatType];
  
  if (isMock) {
    console.log(`[Telegram Mock Audio] To ${chatId}: (buffer length ${audioBuffer.length}) ${caption}`);
    return { ok: true, result: { message_id: 124 } };
  }
  
  const url = `https://api.telegram.org/bot${config.bot_token}/sendAudio`;
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('audio', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'alert.mp3');
  
  const res = await fetch(url, {
    method: 'POST',
    body: formData
  });
  return await res.json();
}

export async function sendDocument(chatType, documentBuffer, filename = 'document.pdf', caption = '') {
  const config = await getTelegramConfig();
  const chatId = config.chats[chatType];
  
  if (isMock) {
    console.log(`[Telegram Mock Document] To ${chatId}: (buffer length ${documentBuffer.length}) ${filename}`);
    return { ok: true, result: { message_id: 125 } };
  }
  
  const url = `https://api.telegram.org/bot${config.bot_token}/sendDocument`;
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('caption', caption);
  formData.append('document', new Blob([documentBuffer], { type: 'application/pdf' }), filename);
  
  const res = await fetch(url, {
    method: 'POST',
    body: formData
  });
  return await res.json();
}

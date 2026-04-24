import { ENCRYPTION_KEY } from '../config/constants';
import { encrypt, decrypt } from '../utils/encryption';
import { getAdsAccount } from '../database/adsRepository';

export interface MetaCredentials {
  accessToken: string;
  adAccountId: string;
  appId: string;
}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  customerId: string;
}

export function encryptCredentials(creds: MetaCredentials | GoogleCredentials): string {
  return encrypt(JSON.stringify(creds), ENCRYPTION_KEY);
}

export function decryptCredentials<T = MetaCredentials | GoogleCredentials>(encrypted: string): T {
  const json = decrypt(encrypted, ENCRYPTION_KEY);
  return JSON.parse(json) as T;
}

export async function getMetaCredentials(adsAccountId: string): Promise<MetaCredentials> {
  const account = await getAdsAccount(adsAccountId);
  if (!account) throw new Error(`AdsAccount ${adsAccountId} not found`);
  return decryptCredentials<MetaCredentials>(account.encryptedCreds);
}

export async function getGoogleCredentials(adsAccountId: string): Promise<GoogleCredentials> {
  const account = await getAdsAccount(adsAccountId);
  if (!account) throw new Error(`AdsAccount ${adsAccountId} not found`);
  return decryptCredentials<GoogleCredentials>(account.encryptedCreds);
}

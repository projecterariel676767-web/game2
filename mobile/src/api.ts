import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const API = (Constants.expoConfig?.extra?.apiUrl || 'http://localhost:10000').replace(/\/$/, '');
const TOKEN_KEY = 'pin-drive-token';
export async function getToken() {
  if (Platform.OS === 'web') return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function saveToken(token: string) {
  if (Platform.OS === 'web') localStorage.setItem(TOKEN_KEY, token);
  else await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function api(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const response = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

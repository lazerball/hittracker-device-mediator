import axios from 'axios';
import * as https from 'https';
import {logger} from './logging';

// @todo use util.promisify once it works in electron again
export const setTimeoutAsync = async (delay: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
};

// Intersection (a ∩ b): create a set that contains those elements of set a that are also in set b.
export const intersection = (a: any[], b: any[]): any[] => {
  const first = new Set(a);
  const second = new Set(b);
  return [...first].filter(x => second.has(x));
};

const getHttpInstance = async (url: string) => {
  return axios.create({
    baseURL: url,
    headers: {
      Accept: 'application/json;version=0.1',
      'Content-Type': 'application/json',
    },
    timeout: 5000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });
};

export const sendRequest = async (url: string, radioId: string, zone: number) => {
  logger.info(`Sending Request to ${url} for ${radioId}:${zone}`);
  const http = await getHttpInstance(url);

  const data = {
    events: [
      {
        event: 'hit',
        radioId,
        zone,
      },
    ],
  };
  try {
    const response = await http.post('/games/hit', JSON.stringify(data));
    logger.info(response.data);
  } catch (e) {
    logger.error(e.response);
  }
};

export type IlluminationStyle = 'rgb' | 'rgbw' | 'simple_led' | 'none';
export class Unit {
  public radioId: string;
  public illuminationStyle: IlluminationStyle;
  public zones: number;

  constructor(radioId: string, zones = 2, illuminationStyle: IlluminationStyle = 'none') {
    this.radioId = radioId;
    this.illuminationStyle = illuminationStyle;
    this.zones = zones;
  }
}

export class GameConfiguration {
  public units: Unit[] = [];
  public gameLength: number = 0;
}



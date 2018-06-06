import axios from 'axios';
import * as https from 'https';
import * as util from 'util';
import {logger} from './logging';

export const setTimeOutAync = util.promisify(setTimeout);
// Intersection (a ∩ b): create a set that contains those elements of set a that are also in set b.
export const intersection = (a: any[], b: any[]): any[] => {
  const first = new Set(a);
  const second = new Set(b);
  return [...first].filter(x => second.has(x));
};

const getHttpInstance = (url: string) => {
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
  const http = getHttpInstance(url);

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
    await http.post('/games/hit', JSON.stringify(data));
  } catch (e) {
    logger.error(e);
  }
};

export class GameConfiguration {
  public radioIds: string[] = [];
  public gameLength: number = 0;
}



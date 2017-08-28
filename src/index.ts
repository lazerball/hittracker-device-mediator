#!/usr/bin/env node
import * as program from 'commander';
import * as KoaLoggerWinston from 'koa-logger-winston';
import { logger } from './logging';

import 'reflect-metadata';
import { createKoaServer } from 'routing-controllers';
import { GameController } from './controller/GameController';

import * as ble from './ble';

// tslint:disable-next-line: no-var-requires
const packageJson = require('../package.json');

program
  .version(packageJson.version)
  .option('-u, --hit-url [url]', 'hit url', 'http://localhost')
  .option('-p, --port [port]', 'port', 3000)
  .option('-d,--hci-device', 'HCI Device', 'hci0')
  .option('-v,--verbose', 'Show all info')
  .parse(process.argv);

logger.transports.console.level = 'info';
if (program.verbose) {
  logger.transports.console.level = 'debug';
}

process.env.NOBLE_HCI_DEVICE_ID = program.hciDevice.replace('hci', '');

const app = createKoaServer({
  controllers: [GameController],
});

app.use(KoaLoggerWinston(logger));
ble.setHitUrlBase(program.hitUrl);
ble.setupNoble();
app.listen(program.port);
logger.info(`Server is up and running at port ${program.port}`);

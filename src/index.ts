#!/usr/bin/env node
import * as path from 'path';

import * as program from 'commander';
import * as KoaLoggerWinston from 'koa-logger-winston';
import { logger } from './logging';

import 'reflect-metadata';
import { createKoaServer, useContainer } from 'routing-controllers';

import { Container } from 'typedi';
import {HitTrackerDeviceManager } from './ble';

// tslint:disable-next-line: no-var-requires
const packageJson = require('../package.json');

program
  .version(packageJson.version)
  .option('-u, --hit-url [url]', 'hit url', 'http://localhost')
  .option('-p, --port [port]', 'port', 3000)
  .option('-d, --hci-device [hci-device]', 'HCI Device', 'hci0')
  .option('-s, --scan-while-connected', 'Show all info')
  .option('-v, --verbose', 'Show all info')
  .parse(process.argv);

logger.transports.console.level = 'info';
if (program.verbose) {
  logger.transports.console.level = 'debug';
}

if (process.env.NOBLE_HCI_DEVICE_ID !== undefined) {
  process.env.NOBLE_HCI_DEVICE_ID = program.hciDevice.replace('hci', '');
}

const deviceManager = new HitTrackerDeviceManager(program.hitUrl);
deviceManager.setupNoble();

useContainer(Container);
Container.set('device-manager', deviceManager);

const ext = path.extname(__filename);

const app = createKoaServer({
  controllers: [`${__dirname}/controller/*${ext}`],
});

app.use(KoaLoggerWinston(logger));

app.listen(program.port);
logger.info(`Server is up and running at port ${program.port}`);

#!/usr/bin/env node
import * as commander from 'commander';
import * as KoaLoggerWinston from 'koa-logger-winston';
import { logger } from './logging';

import 'reflect-metadata';
import { createKoaServer } from 'routing-controllers';
import { GameController } from './controller/GameController';

import * as ble from './ble';

// tslint:disable-next-line: no-var-requires
const packageJson = require('../package.json');

commander
  .version(packageJson.version)
  .arguments('<url>')
  .option('-p, --port [port]', 'port', 3000)
  .option('-v,--verbose', 'Show all info')
  .parse(process.argv);

logger.transports.console.level = 'info';
if (commander.verbose) {
  logger.transports.console.level = 'debug';
}
const app = createKoaServer({
  controllers: [GameController],
});

app.use(KoaLoggerWinston(logger));
ble.setupNoble();
app.listen(commander.port);
logger.info(`Server is up and running at port ${commander.port}`);

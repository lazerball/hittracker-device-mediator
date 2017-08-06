import {Request} from 'koa';
import { Body, ContentType, Get, JsonController,  Post, Req } from 'routing-controllers';
import * as ble from '../ble';
import {logger} from '../logging';

@JsonController()
export class GameController {

  @Post('/start')
  @ContentType('application/json')
  public async start(
    @Body({ required: true, validate: true })
    gameConfiguration: ble.GameConfiguration,
    @Req() request: Request,
  ) {
    logger.debug(JSON.stringify(gameConfiguration));

    try {
      await ble.startGame(gameConfiguration, request.url);
    } catch (error) {
      logger.error(error)
    }
    return 'Started Game';
  }

  @Post('/stop')
  @ContentType('application/json')
  public async stop(@Req() request: Request) {
    try {
      await ble.stopGame(request.url);
    } catch (error) {
      logger.error(error);
    }
    return 'Stopped Game';
  }
}

const http = require('http');
const Koa = require('koa');
const koaBody = require('koa-body');
const koaStatic = require('koa-static');
const Router = require('koa-router');
const cors = require('koa2-cors');
const WS = require('ws');
const path = require('path');
const Storage = require('./Storage');


const app = new Koa();
const router = new Router();

// Body Parsers
app.use(koaBody({
  json: true, text: true, urlencoded: true, multipart: true,
}));

// CORS
app.use(
  cors({
    origin: '*',
    credentials: true,
    'Access-Control-Allow-Origin': true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
);

// Routers
app.use(router.routes()).use(router.allowedMethods());

// Files Directory
const filesDir = path.join(__dirname, '/files');
app.use(koaStatic(filesDir));

// Starting Server
const port = process.env.PORT || 7070;
const server = http.createServer(app.callback());
const wsServer = new WS.Server({ server });

// DATABASE
const dB = [
  {id: '123', message: 'Text example', date: Date.now() - 500000000, geo: '', type: 'text'},
  {id: '124', message: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam pellentesque massa vitae libero luctus, et luctus orci consequat. Fusce fringilla venenatis dapibus.', date: Date.now() - 450000000, geo: '', type: 'text'},
  {id: '125', message: 'Favourite', date: Date.now() - 400000000, geo: '', type: 'text'},
  {id: '126', message: 'Test message with coordinates', date: Date.now() - 350000000, geo: '55.692493, 37.607834', type: 'text'},
  {id: '29a86030-d83c-11eb-9a19-87bef25338c3', message: 'Links: http://ya.ru, https://yandex.ru, https://google.com, http://vk.com', date: Date.now() - 300000000, geo: '', type: 'text'},
  {id: 'd4bb4b20-da82-11eb-9154-2d8ca54d4d13', message: 'bird.jpg', date: Date.now() - 250000000, geo: '', type: 'image'},
  {id: '127', message: 'little-birds-singing-in-the-trees.wav', date: Date.now() - 200000000, type: 'audio'},
  {id: '128', message: 'black-headed-gull-resting-by-the-river.mp4', date: Date.now() - 200000000, type: 'video'},
  {id: '129', message: 'how-to-draw-a-bird.pdf', date: Date.now() - 100000000, geo: '', type: 'file'},
  
];
const category = {
  links: [
    { name: 'http://ya.ru', messageId: '29a86030-d83c-11eb-9a19-87bef25338c3' },
    { name: 'https://yandex.ru', messageId: '29a86030-d83c-11eb-9a19-87bef25338c3' },
    { name: 'https://google.com', messageId: '29a86030-d83c-11eb-9a19-87bef25338c3' },
    { name: 'http://vk.com', messageId: '29a86030-d83c-11eb-9a19-87bef25338c3' },
  ],
  image: [
    { name: 'bird.jpg', messageId: 'd4bb4b20-da82-11eb-9154-2d8ca54d4d13' },
  ],
  audio: [
    { name: 'little-birds-singing-in-the-trees.wav', messageId: '127' },
  ],
  video: [
    { name: 'black-headed-gull-resting-by-the-river.mp4', messageId: '128' },
  ],
  file: [
    { name: 'how-to-draw-a-bird.pdf', messageId: '129' },
  ],
};
const  favourites = new Set(['125', '29a86030-d83c-11eb-9a19-87bef25338c3', '128']);


const clients = [];
wsServer.on('connection', (ws) => {
  clients.push(ws);
  const storage = new Storage(dB, category, favourites, filesDir, ws, clients);
  storage.init();

  router.post('/upload', async (ctx) => {
    storage.loadFile(ctx.request.files.file, ctx.request.body.geo).then((result) => {
      storage.wsAllSend({ ...result, event: 'file' });
    });
    ctx.response.status = 204;
  });

  ws.on('close', () => {
    const wsIndex = clients.indexOf(ws);
    if (wsIndex !== -1) {
      clients.splice(wsIndex, 1);
    }
  });
});

server.listen(port, () => console.log('Server started'));
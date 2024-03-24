const uuid = require('uuid');
const path = require('path');
const fs = require('fs');
const { constants } = require('buffer');

module.exports = class Storage {
  constructor(dB, categorydB, favouritesdB, filesDir, ws, clients) {
    this.ws = ws;
    this.clients = clients;
    this.dB = dB;
    this.category = categorydB;
    this.favourites = favouritesdB;
    this.filesDir = filesDir;
    this.allowedTypes = ['image', 'video', 'audio'];
  }

  init() {
    this.ws.on('message', (message) => {
      const command = JSON.parse(message);

      // Request data from database
      if (command.event === 'load') {
        this.eventLoad(command.message);
      }

      // Request data from category
      if (command.event === 'storage') {
        this.eventStorage(command.message);
      }

      // Request fro message from database
      if (command.event === 'select') {
        this.eventSelect(command.message);
      }

      // New message
      if (command.event === 'message') {
        this.eventMessage(command.message);
      }

      // Delete message
      if (command.event === 'delete') {
        this.eventDelete(command.message);
      }

      // Add to favourites
      if (command.event === 'favourite') {
        this.eventFavourite(command.message);
      }

      // Delete from favourites
      if (command.event === 'favouriteRemove') {
        this.eventFavouriteRemove(command.message);
      }

      // Request for favourite messages
      if (command.event === 'favouritesLoad') {
        this.eventFavouritesLoad(command.message);
      }

      // Pin message
      if (command.event === 'pin') {
        this.eventPin(command.message);
      }

      // Delete pinned message
      if (command.event === 'unpin') {
        this.eventUnpin(command.message);
      }
    });
  }

  // Request data from database
  eventLoad(position) {
    // For "lazy" loading
    const startPosition = position || this.dB.length;
    const itemCounter = startPosition > 10 ? 10 : startPosition;
    const returnDB = [];
    for (let i = 1; i <= itemCounter; i += 1) {
      returnDB.push(this.dB[startPosition - i]);
    }

    const pinnedMessage = this.dB.find((message) => message.pinned);

    const data = {
      event: 'database',
      dB: returnDB,
      favourites: [...this.favourites],
      pinnedMessage,
      side: this.createSideObject(),
      position: startPosition - 10,
    };
    this.wsSend(data);
  }

  // Request data from category
  eventStorage(category) {
    this.wsSend({ event: 'storage', category, data: this.category[category] });
  }

  // Request fro message from database
  eventSelect(select) {
    const message = this.dB.find((item) => item.id === select);
    this.wsSend({ event: 'select', message });
  }

  // New message
  eventMessage(message) {
    const { text, geo } = message;
    const data = {
      id: uuid.v1(),
      message: text,
      date: Date.now(),
      type: 'text',
      geo,
    };
    this.dB.push(data);
    this.linksToLinks(text, data.id);
    this.wsAllSend({ ...data, event: 'text', side: this.createSideObject() });
  }

  // Delete message
  eventDelete(id) {
    const unlinkFiles = new Set();
    [...this.allowedTypes, 'links', 'file'].forEach((type) => {
      const filesInCategory = this.category[type].filter((item) => item.messageId === id).map((item) => item.name);
      filesInCategory.forEach((fileName) => unlinkFiles.add(fileName));
      this.category[type] = this.category[type].filter((item) => item.messageId !== id);
    });
    unlinkFiles.forEach((fileName) => {
      fs.unlink(path.join(this.filesDir, fileName), () => {});
    });

    this.favourites.delete(id);

    const messageIndex = this.dB.findIndex((item) => item.id === id);
    this.dB.splice(messageIndex, 1);
    this.wsAllSend({ id, event: 'delete', side: this.createSideObject() });
  }

  // Add to favourites
  eventFavourite(id) {
    this.favourites.add(id);
    this.wsAllSend({ id, event: 'favourite', side: this.createSideObject() });
  }

  // Delete from favourites
  eventFavouriteRemove(id) {
    this.favourites.delete(id);
    this.wsAllSend({ id, event: 'favouriteRemove', side: this.createSideObject() });
  }

  // All favoutie messages
  eventFavouritesLoad(){
    const filterMessages = this.dB.filter((message) => this.favourites.has(message.id));
    // For "lazy" loading
    const startPosition = filterMessages.length;
    const itemCounter = startPosition > 10 ? 10 : startPosition;
    const returnDB = [];
    for (let i = 1; i <= itemCounter; i += 1) {
      returnDB.push(filterMessages[startPosition - i]);
    }

    const pinnedMessage = this.dB.find((message) => message.pinned);

    const data = {
      event: 'favouritesLoad',
      dB: returnDB,
      favourites: [...this.favourites],
      pinnedMessage,
      side: this.createSideObject(),
      position: startPosition - 10,
    };
    this.wsSend(data);
  }

  // Pin message
  eventPin(id) {
    const hasPinned = this.dB.find((message) => message.pinned);
    if (hasPinned) {
      delete hasPinned.pinned;
    }

    const pinnedMessage = this.dB.find((message) => message.id === id);
    pinnedMessage.pinned = true;
    this.wsAllSend({ pinnedMessage, event: 'pin' });
  }

  // Delete pinned message
  eventUnpin(id) {
    delete this.dB.find((message) => message.id === id).pinned;
    this.wsAllSend({ id, event: 'unpin' });
  }

  // Sending server response
  wsSend(data) {
    this.ws.send(JSON.stringify(data));
  }

  // Send responses to all server clients
  wsAllSend(data) {
    for(const client of this.clients) {
      client.send(JSON.stringify(data));
    }
  }

  // Formation of side object with information by storage categories
  createSideObject() {
    const sideLengths = {};
    sideLengths.favourites = this.favourites.size;
    for (const category in this.category) {
      sideLengths[category] = this.category[category].length;
    }
    return sideLengths;
  }

  // Receiving and processing files
  loadFile(file, geo) {
    return new Promise((resolve, reject) => {
      const { fileName, fileType } = this.fileToFile(file);
      const oldPath = file.path;
      const newPath = path.join(this.filesDir, fileName);

      const callback = (error) => reject(error);

      const readStream = fs.createReadStream(oldPath);
      const writeStream = fs.createWriteStream(newPath);

      readStream.on('error', callback);
      writeStream.on('error', callback);
      readStream.on('close', () => {
        fs.unlink(oldPath, callback);
        const data = {
          id: uuid.v1(),
          message: fileName,
          date: Date.now(),
          type: fileType,
          geo,
        };
        this.dB.push(data);

        this.category[fileType].push({ name: fileName, messageId: data.id });

        resolve({ ...data, side: this.createSideObject() });
      });

      readStream.pipe(writeStream);
    });
  }

  // Distribution to the file base
  fileToFile(file) {
    // Define file type
    let fileType = file.type.split('/')[0];
    fileType = this.allowedTypes.includes(fileType) ? fileType : 'file';

    // Blob from MediaRecorder if it's a file
    if (file.name === 'blob') {
      file.name = `recorder.${file.type.split('/')[1]}`;
    }

    // Specify the uniqueness of the file name
    let fileName = file.name;
    let index = 1;
    while (this.category[fileType].findIndex((item) => item.name === fileName) > -1) {
      const fileExtension = file.name.split('.').pop();
      const filePrefName = file.name.split(fileExtension)[0].slice(0, -1);
      fileName = `${filePrefName}_${index}.${fileExtension}`;
      index += 1;
    }

    return { fileName, fileType };
  }

  // Writing to the link database
  linksToLinks(text, messageId) {
    const links = text.match(/(http:\/\/|https:\/\/){1}(www)?([\da-z.-]+)\.([a-z.]{2,6})([/\w.-?%#&-]*)*\/?/gi);
    if (links) {
      this.category.links.push(...links.map((item) => ({ name: item, messageId })));
    }
  }
};
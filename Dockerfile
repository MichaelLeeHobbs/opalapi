FROM node:12.8.0-alpine
WORKDIR /usr/src/app
RUN npm install -g nodemon
RUN mkdir /usr/src/app/tmp && chown -Rh node:node /usr/src/app/tmp

COPY package* ./
RUN npm install --only=production
USER node
COPY src src

ENV NPM_CONFIG_LOGLEVEL info
EXPOSE 3000
CMD node ./src/index.js
#CMD sleep 900

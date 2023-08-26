FROM node:16-alpine
ENV PROMPTFOO_BUILD_STANDALONE_SERVER=1
ENV NEXT_PUBLIC_PROMPTFOO_WITH_DATABASE=1

WORKDIR /app

COPY . .

WORKDIR /app/src/web/nextui

# TODO(ian): Modify to multistep build so we don't carry over development packages
RUN npm install
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]

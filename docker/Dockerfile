FROM node:16-alpine

ARG REGISTRY
ARG REGISTRY_TOKEN
ARG VERSION=latest

RUN if [[ ! -z "$REGISTRY_TOKEN" ]]; then echo "//$REGISTRY/:_authToken=$REGISTRY_TOKEN" >> ~/.npmrc ; fi
RUN if [[ ! -z "$REGISTRY" ]] ; then npm config set @flowforge:registry "https://$REGISTRY"; fi

RUN apk add --no-cache --virtual buildtools build-base linux-headers udev python3

RUN mkdir /opt/flowforge-device
RUN npm install -g @flowforge/flowforge-device-agent@${VERSION}

EXPOSE 1880

LABEL org.label-schema.name="Flowforge Device Agent" \
    org.label-schema.url="https://flowforge.com" \
    org.label-schema.vcs-type="Git" \
    org.label-schema.vcs-url="https://github.com/flowforge/flowforge-device-agent" \
    org.label-schema.docker.dockerfile="docker/Dockerfile" \
    org.schema-label.description="Collaborative, low code integration and automation environment" \
    authors="Flowforge Inc."


CMD ["flowforge-device-agent"]
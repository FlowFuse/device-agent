ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine

ARG VERSION=latest
ARG FF_UID=2000
ARG FF_GID=2000

RUN apk add --no-cache --virtual buildtools build-base linux-headers udev python3 openssl

RUN addgroup -g ${FF_GID} -S flowfuse \
    && adduser -u ${FF_UID} -S -G flowfuse -h /opt/flowfuse-device flowfuse \
    && mkdir -p /opt/flowfuse-device \
    && chown -R "${FF_UID}":"${FF_GID}" /opt/flowfuse-device

RUN npm config set cache /opt/flowfuse-device/.npm --global \
    && npm install -g @flowfuse/device-agent@${VERSION} --omit=dev \
    && chown -R ${FF_UID}:${FF_GID} /opt/flowfuse-device

EXPOSE 1880

LABEL org.label-schema.name="FlowFuse Device Agent" \
    org.label-schema.url="https://flowfuse.com" \
    org.label-schema.vcs-type="Git" \
    org.label-schema.vcs-url="https://github.com/FlowFuse/device-agent" \
    org.label-schema.docker.dockerfile="docker/Dockerfile" \
    org.schema-label.description="Collaborative, low code integration and automation environment" \
    authors="FlowFuse Inc."


ENV HOME=/opt/flowfuse-device

USER ${FF_UID}:${FF_GID}

CMD ["flowfuse-device-agent"]

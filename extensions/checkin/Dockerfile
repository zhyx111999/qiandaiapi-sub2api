# Yezi daily check-in sidecar. Same base images as the official Sub2API build.
ARG GOLANG_IMAGE=golang:1.27.3-alpine
ARG ALPINE_IMAGE=alpine:3.21

FROM ${GOLANG_IMAGE} AS build
ARG GOPROXY=https://goproxy.cn,https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY} CGO_ENABLED=0
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -trimpath -ldflags="-s -w" -o /out/checkin ./cmd/checkin

FROM ${ALPINE_IMAGE}
COPY --from=build /out/checkin /usr/local/bin/checkin
USER nobody
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/checkin"]

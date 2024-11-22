![](https://img.shields.io/npm/v/proto2gql?style=for-the-badge)
![](https://img.shields.io/npm/dt/proto2gql?style=for-the-badge)
![](https://img.shields.io/github/last-commit/serhankileci/proto2gql?style=for-the-badge)
![](https://img.shields.io/github/license/serhankileci/proto2gql?style=for-the-badge)

# proto2gql

CLI application to convert/map Protobuf file(s) into a GraphQL schema with the equivalent types. Useful for building GraphQL API gateways that interact with gRPC services using protobufs.

## Install

```bash
npm install proto2gql
```

## Usage

To convert the protobuf file(s) into a GraphQL schema, use the following command:

`<input>`: Path to a protobuf file or folder.

`<output>`: Path to the destination folder for the schema.

```bash
proto2gql <input> <output>
```

For example:

```bash
proto2gql ./protos ./schemas
# OR
proto2gql ./protos/example.proto ./schemas
```

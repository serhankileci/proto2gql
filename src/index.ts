#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import protobuf, { FieldBase } from "protobufjs";

/********** INIT **********/
const [input, output, flag] =
	process.env.NODE_ENV === "production" ? process.argv.slice(2) : ["protos", "protos", ""];
const usage = `
To convert the protobuf file(s) into a GraphQL schema, use the following command:

<input>: Path to a protobuf file or folder.
<output>: Path to the destination folder for the schema.

proto2gql <input> <output>

For example:

proto2gql ./protos ./schemas
proto2gql ./protos/example.proto ./schemas
`;
const supportedVer = "Currently only proto3 is supported";
const recursiveFlags = ["-r", "--recursive"];
const helpFlags = ["-h", "--help", "help"];
const outputFilename = "schema.graphql";

if (input && helpFlags.includes(input)) {
	console.info(`${usage}. ${supportedVer}.`);
	process.exit(0);
}

if (!input || !output) {
	console.error(`Invalid arguments. ${usage}.`);
	process.exit(1);
}

proto2gql(input, output)
	// ...
	.catch(err => {
		console.error("Unexpected error during conversion:", err);
		process.exit(1);
	});

/********** UTIL **********/
const typeMapping: Record<string, string> = {
	double: "Float",
	float: "Float",
	int32: "Int",
	int64: "Int",
	uint32: "Int",
	uint64: "Int",
	sint32: "Int",
	sint64: "Int",
	fixed32: "Int",
	fixed64: "Int",
	sfixed32: "Int",
	sfixed64: "Int",
	bool: "Boolean",
	string: "String",
	bytes: "String",
	map: "JSON",
};

const googleTypeMapping: Record<string, Record<"typeName" | "value", string>> = {
	"google.protobuf.StringValue": {
		typeName: "StringValue",
		value: "{\n\tvalue: String\n}",
	},
	"google.protobuf.DoubleValue": {
		typeName: "DoubleValue",
		value: "{\n\tvalue: Float\n}",
	},
	"google.protobuf.Int32Value": {
		typeName: "Int32Value",
		value: "{\n\tvalue: Int\n}",
	},
	"google.protobuf.Int64Value": {
		typeName: "Int64Value",
		value: "{\n\tvalue: Int\n}",
	},
	"google.protobuf.UInt32Value": {
		typeName: "UInt32Value",
		value: "{\n\tvalue: Int\n}",
	},
	"google.protobuf.UInt64Value": {
		typeName: "UInt64Value",
		value: "{\n\tvalue: Int\n}",
	},
	"google.protobuf.BoolValue": {
		typeName: "BoolValue",
		value: "{\n\tvalue: Boolean\n}",
	},
	"google.protobuf.BytesValue": {
		typeName: "BytesValue",
		value: "{\n\tvalue: String\n}",
	},
	"google.protobuf.FloatValue": {
		typeName: "FloatValue",
		value: "{\n\tvalue: Float\n}",
	},
	"google.protobuf.Empty": {
		typeName: "Empty",
		value: "{}",
	},
	"google.protobuf.Any": {
		typeName: "Any",
		value: "{\n\tvalue: JSON\n}",
	},
};

const resourceVerbs = {
	query: ["Get", "List"],
	mutation: ["Create", "Update", "Delete"],
};

async function loadProtobufFiles(dirOrFile: string): Promise<string[]> {
	const result: string[] = [];
	const stats = await fs.stat(dirOrFile);

	if (stats.isFile() && dirOrFile.endsWith(".proto")) {
		result.push(dirOrFile);
	} else if (stats.isDirectory()) {
		const files = await fs.readdir(dirOrFile);

		for (const file of files) {
			if (flag && recursiveFlags.includes(flag)) {
				const fullPath = path.join(dirOrFile, file);
				const subResults = await loadProtobufFiles(fullPath);

				result.push(...subResults);
			} else {
				const fullPath = path.resolve(dirOrFile, file);
				const stats2 = await fs.stat(fullPath);

				if (stats2.isFile() && file.endsWith(".proto")) {
					result.push(fullPath);
				}
			}
		}
	}

	return result;
}

function protobufEnumToGraphQL(obj: protobuf.Enum): string {
	const enumType =
		`enum ${obj.name} {\n` +
		Object.keys(obj.values)
			.map(value => `\t${value}`)
			.join("\n") +
		"\n}";

	return enumType;
}

function protobufServiceToGraphQL(service: protobuf.Service): string {
	const queries: string[] = [];
	const mutations: string[] = [];

	Object.values(service.methods).forEach((method: protobuf.Method) => {
		const gqlField = `  ${method.name}(${method.requestType}: ${method.requestType}): ${method.responseType}`;

		if (resourceVerbs.query.some(verb => method.name.startsWith(verb))) {
			queries.push(gqlField);
		} else if (resourceVerbs.mutation.some(verb => method.name.startsWith(verb))) {
			mutations.push(gqlField);
		} else {
			mutations.push(gqlField);
		}
	});

	const queryType = queries.length ? `type Query {\n${queries.join("\n")}\n}` : "";
	const mutationType = mutations.length ? `type Mutation {\n${mutations.join("\n")}\n}` : "";

	return [queryType, mutationType].filter(Boolean).join("\n\n");
}

function protobufToGraphQL(root: protobuf.Root): string | null {
	const types: string[] = [];
	const nested = root.nested;

	if (!nested) {
		return null;
	}

	const syntax = root.options?.syntax as string;

	if (!syntax.endsWith("3")) {
		console.error(`Invalid Protobuf version detected, ${supportedVer.toLowerCase()}.`);
		process.exit(1);
	}

	Object.values(nested).forEach(obj => {
		if (obj instanceof protobuf.Enum) {
			types.push(protobufEnumToGraphQL(obj));
		} else if (obj instanceof protobuf.Service) {
			types.push(protobufServiceToGraphQL(obj));
		} else if (obj instanceof protobuf.Namespace) {
			const isPackage = obj.nestedArray.some(
				nestedObj => nestedObj instanceof protobuf.Namespace
			);

			if (isPackage) {
				if (obj.name === "google") {
					return;
				}

				const packageTypes: string[] = [];

				obj.nestedArray.forEach(nestedObj => {
					if (nestedObj instanceof protobuf.Type) {
						const fields = Object.values<FieldBase>(nestedObj.fields).map(value => {
							const googleField = googleTypeMapping[value.type];
							let gqlType = typeMapping[value.type] || value.type;

							if (googleField) {
								packageTypes.unshift(
									`type ${googleField.typeName} ${googleField.value}`
								);
								gqlType = googleField.typeName;
							}

							if (value.map) {
								gqlType = "JSON";
							}

							const isArray = value.repeated ? "[" + gqlType + "]" : gqlType;

							if (value.name.startsWith(".")) {
								value.name = value.name.slice(1);
							}

							return `\t${value.name}: ${isArray}`;
						});

						const oneofFields =
							nestedObj.oneofsArray?.map(oneof => {
								const oneofFieldNames = oneof.fieldsArray.map(
									(field: protobuf.Field) => nestedObj.fields[field.name]!.name
								);

								return `\t# oneof: ${oneofFieldNames.join(", ")}\n\t${
									oneof.name
								}: ${oneofFieldNames
									.map(
										f =>
											typeMapping[nestedObj.fields[f]!.type] ||
											nestedObj.fields[f]!.type
									)
									.join(" | ")}`;
							}) || [];

						packageTypes.push(
							`type ${nestedObj.name} {\n${[...fields, ...oneofFields].join("\n")}\n}`
						);
						packageTypes.push(
							`input ${nestedObj.name}Input {\n${[...fields, ...oneofFields].join(
								"\n"
							)}\n}`
						);
					} else if (nestedObj instanceof protobuf.Enum) {
						packageTypes.push(protobufEnumToGraphQL(nestedObj));
					} else if (nestedObj instanceof protobuf.Service) {
						packageTypes.push(protobufServiceToGraphQL(nestedObj));
					}
				});

				types.push(`${packageTypes.join("\n\n")}\n`);
			} else if (obj instanceof protobuf.Type) {
				const fields = Object.values<FieldBase>(obj.fields).map(value => {
					const googleField = googleTypeMapping[value.type];
					let gqlType = typeMapping[value.type] || value.type;

					if (googleField) {
						types.unshift(`type ${googleField.typeName} ${googleField.value}`);
						gqlType = googleField.typeName;
					}

					if (value.map) {
						gqlType = "JSON";
					}

					const isArray = value.repeated ? "[" + gqlType + "]" : gqlType;

					if (value.name.startsWith(".")) {
						value.name = value.name.slice(1);
					}

					return `\t${value.name}: ${isArray}`;
				});

				const oneofFields =
					obj.oneofsArray?.map(oneof => {
						const oneofFieldNames = oneof.fieldsArray.map(
							(field: protobuf.Field) => obj.fields[field.name]!.name
						);

						return `\t# oneof: ${oneofFieldNames.join(", ")}\n\t${
							oneof.name
						}: ${oneofFieldNames
							.map(f => typeMapping[obj.fields[f]!.type] || obj.fields[f]!.type)
							.join(" | ")}`;
					}) || [];

				types.push(`type ${obj.name} {\n${[...fields, ...oneofFields].join("\n")}\n}`);
				types.push(
					`input ${obj.name}Input {\n${[...fields, ...oneofFields].join("\n")}\n}`
				);
			}
		}
	});

	return types.join("\n\n") + "\n";
}

async function proto2gql(input: string, output: string): Promise<void> {
	const protoFiles = await loadProtobufFiles(input);

	if (protoFiles.length === 0) {
		console.error(
			`Could not find protobuf files in the provided path: '${path.resolve(input)}'.`
		);

		process.exit(1);
	}

	const root = new protobuf.Root();

	await Promise.all(protoFiles.map(file => root.load(file, { keepCase: true })));

	const schema = protobufToGraphQL(root)?.trim();

	if (!schema) {
		console.error("Failed operation (unknown parsing issue, did not write to schema file).");

		process.exit(1);
	}

	const outputPath = path.join(output, outputFilename);

	await fs.writeFile(outputPath, schema, "utf-8");

	console.info(
		`Converted ${protoFiles.length} protobuf${
			protoFiles.length > 1 ? "s" : ""
		} into a GraphQL schema at ${outputPath}.`
	);
}

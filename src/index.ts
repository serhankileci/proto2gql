import fs from "node:fs/promises";
import path from "node:path";
import protobuf, { type FieldBase } from "protobufjs";

/********** INIT **********/
const [input, output, flag] = process.argv.slice(2);
const usage = "Usage: 'proto2gql path/to/protobuf-or-folder path/to/save/gql-schema'";
const supportedVer = "Currently only proto3 is supported";
const recursiveFlags = ["-r", "--recursive"];
const helpFlags = ["-h", "--help", "help"];

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

function protobufToGraphQL(root: protobuf.Root): string | null {
	const types: string[] = [];
	const nested = root.nested?.example;

	if (!nested) {
		return null;
	}

	const syntax = root.options?.syntax as string;

	if (!syntax.endsWith("3")) {
		console.error(`Invalid Protobuf version detected, ${supportedVer.toLowerCase()}.`);
		process.exit(1);
	}

	const messages = Object.entries(nested).filter(([k, _]) => /^[A-Z]/.test(k));

	messages.forEach(([_, obj]) => {
		const fields = Object.values<FieldBase>(obj.fields).map(value => {
			const googleField = googleTypeMapping[value.type];
			let gqlType = typeMapping[value.type] || value.type;

			if (googleField) {
				types.unshift(`type ${googleField.typeName} ${googleField.value}`);
				gqlType = googleField.typeName;
			}

			const isArray = value.repeated ? "[" + gqlType + "]" : gqlType;

			return `\t${value.name}: ${isArray}`;
		});

		types.push(`type ${obj.name} {\n${fields.join("\n")}\n}`);
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

	const schema = protobufToGraphQL(root);

	if (!schema) {
		console.error("Unexpected error.");

		process.exit(1);
	}

	await fs.writeFile(output, schema, "utf-8");

	console.log(
		`Converted ${protoFiles.length} protobuf${
			protoFiles.length > 1 ? "s" : ""
		} into a GraphQL schema at ${output}.`
	);
}

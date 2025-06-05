import type { Context } from "../context.ts";
import {
  Resource,
  ResourceKind,
  ResourceID,
  ResourceFQN,
  ResourceScope,
  ResourceSeq,
} from "../resource.ts";
import { Scope } from "../scope.ts";
import {
  createSupabaseApi,
  type SupabaseApiOptions,
  type SupabaseApi,
} from "./api.ts";
import { handleApiError } from "./api-error.ts";
import type { Project } from "./project.ts";
import { Bundle } from "../esbuild/bundle.ts";
import fs from "node:fs/promises";

/**
 * Properties for creating or updating a Supabase Edge Function
 */
export interface FunctionProps extends SupabaseApiOptions {
  /**
   * Reference to the project (string ID or Project resource)
   */
  project: string | Project;

  /**
   * Name of the function (optional, defaults to resource ID)
   */
  name?: string;

  /**
   * Function body as a string (for inline functions)
   */
  body?: string;

  /**
   * Path to the main entry file (for file-based functions with bundling)
   */
  main?: string;

  /**
   * Import map for Deno imports
   */
  importMap?: Record<string, string>;

  /**
   * Custom entrypoint URL
   */
  entrypointUrl?: string;

  /**
   * Whether to verify JWT tokens
   */
  verifyJwt?: boolean;

  /**
   * Whether to adopt an existing function instead of failing on conflict
   */
  adopt?: boolean;

  /**
   * Whether to delete the function on resource destruction
   */
  delete?: boolean;
}

/**
 * Supabase Edge Function resource
 */
export interface Function extends Resource<"supabase::Function"> {
  /**
   * Unique identifier of the function
   */
  id: string;

  /**
   * URL-safe slug of the function
   */
  slug: string;

  /**
   * Display name of the function
   */
  name: string;

  /**
   * Current status of the function
   */
  status: string;

  /**
   * Current version number of the function
   */
  version: number;

  /**
   * Creation timestamp
   */
  createdAt: string;

  /**
   * Last update timestamp
   */
  updatedAt: string;
}

/**
 * Type guard to check if a resource is a Function
 */
export function isFunction(resource: Resource): resource is Function {
  return resource[ResourceKind] === "supabase::Function";
}

/**
 * Create and manage Supabase Edge Functions
 *
 * @example
 * // Create a function with file-based entrypoint:
 * const func = Function("api-handler", {
 *   project: myProject,
 *   main: "./functions/api-handler.ts"
 * });
 *
 * @example
 * // Create a function with external TypeScript file:
 * const func = Function("hello-world", {
 *   project: "proj-123",
 *   main: "./src/hello-world.ts"
 * });
 *
 * @example
 * // Create a function with import map and JWT verification:
 * const func = Function("secure-api", {
 *   project: "proj-123",
 *   main: "./src/secure-api.ts",
 *   importMap: {
 *     "std/": "https://deno.land/std@0.168.0/"
 *   },
 *   verifyJwt: true
 * });
 */
export const Function = Resource(
  "supabase::Function",
  async function (
    this: Context<Function>,
    id: string,
    props: FunctionProps,
  ): Promise<Function> {
    const api = await createSupabaseApi(props);
    const name = props.name ?? id;
    const projectRef =
      typeof props.project === "string" ? props.project : props.project.id;

    let functionBody = props.body;
    if (props.main && !props.body) {
      functionBody = await bundleFunctionCode(props.main);
    }

    if (this.phase === "delete") {
      const functionSlug = this.output?.slug;
      if (functionSlug && props.delete !== false) {
        await deleteFunction(api, projectRef, functionSlug);
      }
      return this.destroy();
    }

    if (this.phase === "update" && this.output?.slug) {
      if (functionBody) {
        await deployFunction(api, projectRef, this.output.slug, {
          body: functionBody,
          import_map: props.importMap,
          entrypoint_url: props.entrypointUrl,
          verify_jwt: props.verifyJwt,
        });
      }
      const func = await getFunction(api, projectRef, this.output.slug);
      return this(func);
    }

    try {
      const func = await createFunction(api, projectRef, {
        slug: name,
        name,
        body: functionBody,
        import_map: props.importMap,
        entrypoint_url: props.entrypointUrl,
        verify_jwt: props.verifyJwt,
      });
      return this(func);
    } catch (error) {
      if (
        props.adopt &&
        error instanceof Error &&
        error.message.includes("already exists")
      ) {
        const existingFunc = await findFunctionByName(api, projectRef, name);
        if (!existingFunc) {
          throw new Error(
            `Failed to find existing function '${name}' for adoption`,
          );
        }
        return this(existingFunc);
      }
      throw error;
    }
  },
);

async function createFunction(
  api: SupabaseApi,
  projectRef: string,
  params: any,
): Promise<Function> {
  const response = await api.post(`/projects/${projectRef}/functions`, params);
  if (!response.ok) {
    await handleApiError(response, "creating", "function", params.name);
  }
  const data = await response.json();
  return mapFunctionResponse(data);
}

async function getFunction(
  api: SupabaseApi,
  projectRef: string,
  slug: string,
): Promise<Function> {
  const response = await api.get(`/projects/${projectRef}/functions/${slug}`);
  if (!response.ok) {
    await handleApiError(response, "getting", "function", slug);
  }
  const data = await response.json();
  return mapFunctionResponse(data);
}

async function deployFunction(
  api: SupabaseApi,
  projectRef: string,
  slug: string,
  params: any,
): Promise<void> {
  const response = await api.post(
    `/projects/${projectRef}/functions/${slug}/deploy`,
    params,
  );
  if (!response.ok) {
    await handleApiError(response, "deploying", "function", slug);
  }
}

async function deleteFunction(
  api: SupabaseApi,
  projectRef: string,
  slug: string,
): Promise<void> {
  const response = await api.delete(
    `/projects/${projectRef}/functions/${slug}`,
  );
  if (!response.ok && response.status !== 404) {
    await handleApiError(response, "deleting", "function", slug);
  }
}

async function findFunctionByName(
  api: SupabaseApi,
  projectRef: string,
  name: string,
): Promise<Function | null> {
  const response = await api.get(`/projects/${projectRef}/functions`);
  if (!response.ok) {
    await handleApiError(response, "listing", "functions");
  }
  const functions = (await response.json()) as any[];
  const match = functions.find((func: any) => func.name === name);
  return match ? mapFunctionResponse(match) : null;
}

async function bundleFunctionCode(entrypoint: string): Promise<string> {
  try {
    const bundle = await Bundle("supabase-function", {
      entryPoint: entrypoint,
      format: "esm",
      target: "esnext",
      platform: "browser",
      minify: false,
      conditions: ["deno", "worker", "browser"],
      keepNames: true,
      loader: {
        ".ts": "ts",
        ".js": "js",
        ".json": "json",
      },
    });

    if (bundle.content) {
      return bundle.content;
    }
    if (bundle.path) {
      return await fs.readFile(bundle.path, "utf-8");
    }
    throw new Error("Failed to create bundle");
  } catch (error) {
    throw new Error(`Failed to bundle function code: ${error}`);
  }
}

function mapFunctionResponse(data: any): Function {
  return {
    [ResourceKind]: "supabase::Function",
    [ResourceID]: data.id,
    [ResourceFQN]: `supabase::Function::${data.id}`,
    [ResourceScope]: Scope.current,
    [ResourceSeq]: 0,
    id: data.id,
    slug: data.slug,
    name: data.name,
    status: data.status,
    version: data.version,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

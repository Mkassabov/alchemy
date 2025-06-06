import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import type { Secret } from "../secret.ts";
import { createRailwayApi, handleRailwayDeleteError } from "./api.ts";
import type { Project } from "./project.ts";
import type { Environment } from "./environment.ts";

export interface VolumeProps {
  /**
   * The name of the volume
   */
  name: string;

  /**
   * The project this volume belongs to. Can be a Project resource or project ID string
   */
  project: string | Project;

  /**
   * The environment this volume belongs to. Can be an Environment resource or environment ID string
   */
  environment: string | Environment;

  /**
   * The path where the volume will be mounted
   */
  mountPath: string;

  /**
   * The size of the volume in GB
   */
  size?: number;

  /**
   * Railway API token to use for authentication. Defaults to RAILWAY_TOKEN environment variable
   */
  apiKey?: Secret;
}

export interface Volume
  extends Resource<"railway::Volume">,
    Omit<VolumeProps, "project" | "environment"> {
  /**
   * The unique identifier of the volume
   */
  id: string;

  /**
   * The ID of the project this volume belongs to
   */
  projectId: string;

  /**
   * The ID of the environment this volume belongs to
   */
  environmentId: string;

  /**
   * The timestamp when the volume was created
   */
  createdAt: string;

  /**
   * The timestamp when the volume was last updated
   */
  updatedAt: string;
}

export const Volume = Resource(
  "railway::Volume",
  async function (
    this: Context<Volume>,
    _id: string,
    props: VolumeProps,
  ): Promise<Volume> {
    const api = createRailwayApi({ apiKey: props.apiKey });

    if (this.phase === "delete") {
      try {
        if (this.output?.id) {
          await deleteVolume(api, this.output.id);
        }
      } catch (error) {
        handleRailwayDeleteError(error, "Volume", this.output?.id);
      }

      return this.destroy();
    }

    if (this.phase === "update" && this.output?.id) {
      const volume = await updateVolume(api, this.output.id, props);

      return this({
        id: volume.id,
        name: volume.name,
        projectId: volume.projectId,
        environmentId: volume.environmentId,
        mountPath: volume.mountPath,
        size: volume.size,
        createdAt: volume.createdAt,
        updatedAt: volume.updatedAt,
      });
    }

    const volume = await createVolume(api, props);

    return this({
      id: volume.id,
      name: volume.name,
      projectId: volume.projectId,
      environmentId: volume.environmentId,
      mountPath: volume.mountPath,
      size: volume.size,
      createdAt: volume.createdAt,
      updatedAt: volume.updatedAt,
    });
  },
);

export async function createVolume(api: any, props: VolumeProps) {
  const projectId =
    typeof props.project === "string" ? props.project : props.project.id;
  const environmentId =
    typeof props.environment === "string"
      ? props.environment
      : props.environment.id;

  const response = await api.mutate(
    `
    mutation VolumeCreate($input: VolumeCreateInput!) {
      volumeCreate(input: $input) {
        id
        name
        projectId
        environmentId
        mountPath
        size
        createdAt
        updatedAt
      }
    }
    `,
    {
      input: {
        name: props.name,
        projectId: projectId,
        environmentId: environmentId,
        mountPath: props.mountPath,
        size: props.size,
      },
    },
  );

  const volume = response.data?.volumeCreate;
  if (!volume) {
    throw new Error("Failed to create Railway volume");
  }

  return volume;
}

export async function updateVolume(api: any, id: string, props: VolumeProps) {
  const response = await api.mutate(
    `
    mutation VolumeUpdate($id: String!, $input: VolumeUpdateInput!) {
      volumeUpdate(id: $id, input: $input) {
        id
        name
        projectId
        environmentId
        mountPath
        size
        createdAt
        updatedAt
      }
    }
    `,
    {
      id,
      input: {
        name: props.name,
        mountPath: props.mountPath,
        size: props.size,
      },
    },
  );

  const volume = response.data?.volumeUpdate;
  if (!volume) {
    throw new Error("Failed to update Railway volume");
  }

  return volume;
}

export async function deleteVolume(api: any, id: string) {
  await api.mutate(
    `
    mutation VolumeDelete($id: String!) {
      volumeDelete(id: $id)
    }
    `,
    { id },
  );
}

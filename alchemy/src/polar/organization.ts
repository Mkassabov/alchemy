import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import type { Secret } from "../secret.ts";
import { createPolarClient, handlePolarDeleteError } from "./client.ts";

export interface OrganizationProps {
  name?: string;
  slug?: string;
  avatarUrl?: string;
  bio?: string;
  company?: string;
  blog?: string;
  location?: string;
  email?: string;
  twitterUsername?: string;
  pledgeMinimumAmount?: number;
  pledgeBadgeShowAmount?: boolean;
  defaultUpfrontSplitToContributors?: number;
  profileSettings?: Record<string, any>;
  featureSettings?: Record<string, any>;
  metadata?: Record<string, string>;
  apiKey?: Secret;
  adopt?: boolean;
}

export interface Organization
  extends Resource<"polar::Organization">,
    OrganizationProps {
  id: string;
  createdAt: string;
  modifiedAt: string;
  name: string;
  slug: string;
  avatarUrl?: string;
  bio?: string;
  company?: string;
  blog?: string;
  location?: string;
  email?: string;
  twitterUsername?: string;
  pledgeMinimumAmount: number;
  pledgeBadgeShowAmount: boolean;
  defaultUpfrontSplitToContributors?: number;
  profileSettings?: Record<string, any>;
  featureSettings?: Record<string, any>;
}

export const Organization = Resource(
  "polar::Organization",
  async function (
    this: Context<Organization>,
    _logicalId: string,
    props: OrganizationProps,
  ): Promise<Organization> {
    const client = createPolarClient({ apiKey: props.apiKey });

    if (this.phase === "delete") {
      try {
        if (this.output?.id) {
          await client.delete(`/organizations/${this.output.id}`);
        }
      } catch (error) {
        handlePolarDeleteError(error, "Organization", this.output?.id);
      }
      return this.destroy();
    }

    let organization: any;

    if (this.phase === "update" && this.output?.id) {
      const updateData: any = {};
      if (props.name !== undefined) updateData.name = props.name;
      if (props.slug !== undefined) updateData.slug = props.slug;
      if (props.avatarUrl !== undefined)
        updateData.avatar_url = props.avatarUrl;
      if (props.bio !== undefined) updateData.bio = props.bio;
      if (props.company !== undefined) updateData.company = props.company;
      if (props.blog !== undefined) updateData.blog = props.blog;
      if (props.location !== undefined) updateData.location = props.location;
      if (props.email !== undefined) updateData.email = props.email;
      if (props.twitterUsername !== undefined)
        updateData.twitter_username = props.twitterUsername;
      if (props.pledgeMinimumAmount !== undefined)
        updateData.pledge_minimum_amount = props.pledgeMinimumAmount;
      if (props.pledgeBadgeShowAmount !== undefined)
        updateData.pledge_badge_show_amount = props.pledgeBadgeShowAmount;
      if (props.defaultUpfrontSplitToContributors !== undefined)
        updateData.default_upfront_split_to_contributors =
          props.defaultUpfrontSplitToContributors;
      if (props.profileSettings !== undefined)
        updateData.profile_settings = props.profileSettings;
      if (props.featureSettings !== undefined)
        updateData.feature_settings = props.featureSettings;
      if (props.metadata !== undefined) updateData.metadata = props.metadata;

      organization = await client.patch(
        `/organizations/${this.output.id}`,
        updateData,
      );
    } else {
      throw new Error(
        "Organization creation is not supported - organizations are typically created through the Polar platform",
      );
    }

    return this({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      avatarUrl: organization.avatar_url,
      bio: organization.bio,
      company: organization.company,
      blog: organization.blog,
      location: organization.location,
      email: organization.email,
      twitterUsername: organization.twitter_username,
      pledgeMinimumAmount: organization.pledge_minimum_amount,
      pledgeBadgeShowAmount: organization.pledge_badge_show_amount,
      defaultUpfrontSplitToContributors:
        organization.default_upfront_split_to_contributors,
      profileSettings: organization.profile_settings,
      featureSettings: organization.feature_settings,
      metadata: organization.metadata || {},
      createdAt: organization.created_at,
      modifiedAt: organization.modified_at,
    });
  },
);

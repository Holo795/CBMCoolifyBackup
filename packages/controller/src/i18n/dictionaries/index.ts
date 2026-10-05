// Merged translation dictionaries. Each section file exports `en` + `fr` with
// the same shape; English is the source of truth for the `Dict` type, so a
// missing or mistyped French key is a compile error.
import * as common from "./common";
import * as nav from "./nav";
import * as auth from "./auth";
import * as overview from "./overview";
import * as instances from "./instances";
import * as resources from "./resources";
import * as snapshots from "./snapshots";
import * as destinations from "./destinations";
import * as agents from "./agents";
import * as users from "./users";
import * as settings from "./settings";
import * as profile from "./profile";
import * as schedule from "./schedule";
import * as components from "./components";
import * as activity from "./activity";
import * as apitokens from "./apitokens";
import * as messages from "./messages";

export const dictionaries = {
  en: {
    common: common.en,
    nav: nav.en,
    auth: auth.en,
    overview: overview.en,
    instances: instances.en,
    resources: resources.en,
    snapshots: snapshots.en,
    destinations: destinations.en,
    agents: agents.en,
    users: users.en,
    settings: settings.en,
    profile: profile.en,
    schedule: schedule.en,
    components: components.en,
    activity: activity.en,
    apitokens: apitokens.en,
    messages: messages.en,
  },
  fr: {
    common: common.fr,
    nav: nav.fr,
    auth: auth.fr,
    overview: overview.fr,
    instances: instances.fr,
    resources: resources.fr,
    snapshots: snapshots.fr,
    destinations: destinations.fr,
    agents: agents.fr,
    users: users.fr,
    settings: settings.fr,
    profile: profile.fr,
    schedule: schedule.fr,
    components: components.fr,
    activity: activity.fr,
    apitokens: apitokens.fr,
    messages: messages.fr,
  },
};

export type Dict = (typeof dictionaries)["en"];
export type Dictionaries = typeof dictionaries;

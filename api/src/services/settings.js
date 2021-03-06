const _ = require('underscore');
const path = require('path');

const db = require('../db');
const environment = require('../environment');
const { info } = require('../logger');

const isObject = obj => obj === Object(obj) && !Array.isArray(obj);

const getDoc = () => db.medic.get('settings');

const doReplace = (target, source) => {
  Object.keys(source).forEach(k => {
    target[k] = source[k];
  });
};

const doExtend = (target, source) => {
  Object.keys(source).forEach(k => {
    if (isObject(source[k])) {
      // object, recurse
      if (!target[k]) {
        target[k] = {};
      }
      doExtend(target[k], source[k]);
    } else {
      // simple property or array
      target[k] = source[k];
    }
  });
};

module.exports = {
  get: () => {
    return getDoc()
      .then(doc => doc.settings)
      .catch(err => {
        if (err.status === 404) {
          // TODO replace this once everyone is on 3.0+
          // return {};
          // check if the ddoc has legacy app_settings
          return db.medic.get('_design/medic')
            .then(ddoc => ddoc.app_settings || {});
        }
        throw err;
      });
  },
  /**
   * Process a request to either replace, overwrite or extend existing settings. 
   * If both replace and overwite are set, then it is assumed that only overwite 
   * is set.
   * @param replace If true, recursively merges the properties leaving existing 
   *                properties not in the input document intact.
   * @param overwrite If true, replace the settings document with input document.
   */
  update: (body, replace, overwrite) => {
    const pathToDefaultConfig = path.resolve(environment.getExtractedResourcesPath(), 'default-docs/settings.doc.json');
    const defaultConfig = require(pathToDefaultConfig);

    return getDoc()
      .catch(err => {
        if (err.status === 404) {
          return { _id: 'settings' };
        }
        throw err;
      })
      .then(doc => {
        if (!doc.settings) {
          doc.settings = {};
        }

        const original = JSON.stringify(doc.settings);

        if (overwrite) {
          doc.settings = body;
        } else if (replace) {
          doReplace(doc.settings, body);
        } else {
          doExtend(doc.settings, body);
        }

        if (doc.settings.permissions) {
          _.defaults(doc.settings.permissions, defaultConfig.permissions);
        } else {
          doc.settings.permissions = defaultConfig.permissions;
        }

        if (JSON.stringify(doc.settings) !== original) {
          info('Updating settings with new defaults');
          return db.medic.put(doc);
        } 
        
        return Promise.resolve();
      });
  }
};

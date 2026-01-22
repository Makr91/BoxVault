# Changelog

## [0.42.2](https://github.com/Makr91/BoxVault/compare/v0.42.1...v0.42.2) (2026-01-22)


### Bug Fixes

* docs ([5f31eed](https://github.com/Makr91/BoxVault/commit/5f31eed4b5d43122fbd8b9fcd9125ef4e24a5d2e))
* ensure setup token file is removed only if it exists ([46d60f9](https://github.com/Makr91/BoxVault/commit/46d60f964efebe28ff31b0fe8cad3f37386af7ee))
* navbar and org switcher ([792eadb](https://github.com/Makr91/BoxVault/commit/792eadbc99430ed08b829478a61011cdd35bbaf9))
* Organization Profile section ([f908b87](https://github.com/Makr91/BoxVault/commit/f908b872f8c025f2d7b6bb2efb17ce53613bb168))

## [0.42.1](https://github.com/Makr91/BoxVault/compare/v0.42.0...v0.42.1) (2026-01-22)


### Bug Fixes

* Description ([f113c1c](https://github.com/Makr91/BoxVault/commit/f113c1c70d6ce18368e21c7ac81b775c5b6103ca))
* versions ([5637437](https://github.com/Makr91/BoxVault/commit/5637437fbd6e72db96c9da37f15e8bb1f61942ef))

## [0.42.0](https://github.com/Makr91/BoxVault/compare/v0.41.0...v0.42.0) (2026-01-22)


### Features

* feat:  ([c7c6653](https://github.com/Makr91/BoxVault/commit/c7c6653197fd33d4a66ec7ec7f44ea72fe43f4d2))


### Bug Fixes

* versions ([f75bb82](https://github.com/Makr91/BoxVault/commit/f75bb82e61be9a6ddfae0ba5ec571ca3509ef331))
* versions ([0a45abc](https://github.com/Makr91/BoxVault/commit/0a45abc9a232478bba017ad56903e796532f09b1))

## [0.41.0](https://github.com/Makr91/BoxVault/compare/v0.40.0...v0.41.0) (2026-01-04)


### Features

* fix health controller and languages ([704d2e8](https://github.com/Makr91/BoxVault/commit/704d2e8892f1d661a170cfc8ed1ce3fc346a052c))
* fix translations and FOUC ([f7727c3](https://github.com/Makr91/BoxVault/commit/f7727c388573c4745f113ef3dc877ad6214ef581))

## [0.40.0](https://github.com/Makr91/BoxVault/compare/v0.39.0...v0.40.0) (2026-01-04)


### Features

* add update checker ([415348d](https://github.com/Makr91/BoxVault/commit/415348dbc410bf804b785360b08956e562bdf0fa))


### Bug Fixes

* email alert configuration ([fa1a7bb](https://github.com/Makr91/BoxVault/commit/fa1a7bb8c4922fe741c4ba5a01685df628bd5e88))

## [0.39.0](https://github.com/Makr91/BoxVault/compare/v0.38.0...v0.39.0) (2026-01-04)


### Features

* updating health status, updating locales, updating mail for alerts ([65df40e](https://github.com/Makr91/BoxVault/commit/65df40e6a5a96614c3c69d27a57d4a42a6a62be0))


### Bug Fixes

* allow multiple people to be emailed in case of server low on disk space ([d6c6b2c](https://github.com/Makr91/BoxVault/commit/d6c6b2c57e2e5955c81042f054267100994d4796))

## [0.38.0](https://github.com/Makr91/BoxVault/compare/v0.37.0...v0.38.0) (2026-01-04)


### Features

* implement configurable iso storage location and space usage ([cd50cd1](https://github.com/Makr91/BoxVault/commit/cd50cd1a688d00cc8c8d81d9833723188637a222))

## [0.37.0](https://github.com/Makr91/BoxVault/compare/v0.36.0...v0.37.0) (2026-01-04)


### Features

* implement download file by name for curl ([6f81305](https://github.com/Makr91/BoxVault/commit/6f813052d40511a07d462c518f6c24f156d63071))
* implement secure path handling for ISO uploads and add user management UI components ([9faa4ac](https://github.com/Makr91/BoxVault/commit/9faa4ac960e8f790790a5082cfd1ea2cb5ff41ec))

## [0.36.0](https://github.com/Makr91/BoxVault/compare/v0.35.0...v0.36.0) (2026-01-04)


### Features

* add checksum copy functionality to ISO list component ([38c19ef](https://github.com/Makr91/BoxVault/commit/38c19ef4731a0c2623699a157fd378408b2a19d3))
* add editing functionality for ISO names in the ISO list component ([6f2e65d](https://github.com/Makr91/BoxVault/commit/6f2e65df02aa90892faf8100f539fdfd39a6eea2))
* enhance ISO upload functionality with configurable timeout and improved error handling ([5253242](https://github.com/Makr91/BoxVault/commit/5253242600b1707f9237706b5560f323321faa78))
* enhance ISO upload security by normalizing file paths and preventing traversal attacks ([a97e733](https://github.com/Makr91/BoxVault/commit/a97e73334143a3f98b7a18ad99a262537492caed))


### Bug Fixes

* correct file path reference in upload cleanup logic ([f8a055e](https://github.com/Makr91/BoxVault/commit/f8a055ee51aeb6d08e30abb3c2a605ac809c2fa8))

## [0.35.0](https://github.com/Makr91/BoxVault/compare/v0.34.0...v0.35.0) (2026-01-04)


### Features

* update download endpoint to return download link and improve error handling in ISO download ([6ee2565](https://github.com/Makr91/BoxVault/commit/6ee25659363e195196206d1acc7ec416158de546))
* update download link endpoint to support public access and change request method to POST ([77c4ffa](https://github.com/Makr91/BoxVault/commit/77c4ffa453a4bc24b0f9670f90a429ee027319cc))

## [0.34.0](https://github.com/Makr91/BoxVault/compare/v0.33.0...v0.34.0) (2026-01-04)


### Features

* add Swagger documentation for ISO and provider endpoints ([6e40790](https://github.com/Makr91/BoxVault/commit/6e407903b307bf2092bbe519394e757c191b47e2))
* enhance ISO download functionality with token verification and scoped JWT ([31f221e](https://github.com/Makr91/BoxVault/commit/31f221eb8e6adbb91cfa60b8aeefa1158b2eec48))

## [0.33.0](https://github.com/Makr91/BoxVault/compare/v0.32.2...v0.33.0) (2026-01-04)


### Features

* add discover and get public ISOs endpoints with corresponding service methods ([134b26c](https://github.com/Makr91/BoxVault/commit/134b26cb048bae56daf9e5e7e744ddbbc1a07281))

## [0.32.2](https://github.com/Makr91/BoxVault/compare/v0.32.1...v0.32.2) (2026-01-04)


### Bug Fixes

* add showOnlyPublic prop to IsoList and update organization handling in Organization component ([4d85c29](https://github.com/Makr91/BoxVault/commit/4d85c2961d8d06b4a1b888e25e9531485ba2fc20))

## [0.32.1](https://github.com/Makr91/BoxVault/compare/v0.32.0...v0.32.1) (2026-01-04)


### Bug Fixes

* leave button ([8e11da1](https://github.com/Makr91/BoxVault/commit/8e11da16a0284af02be2a35ba6bdd6409f605509))
* refactor organization handling in BoxesList and authorization logic ([5249627](https://github.com/Makr91/BoxVault/commit/524962749056f92781c779c5b9f0f5f72c5d29db))
* update invitation email handling and organization update logic ([04dcae0](https://github.com/Makr91/BoxVault/commit/04dcae0cec5ca918ea3149bfcc10ab4054cbdbe7))

## [0.32.0](https://github.com/Makr91/BoxVault/compare/v0.31.0...v0.32.0) (2026-01-04)


### Features

* implement ISO management features including upload, download, delete, and listing ([1be8068](https://github.com/Makr91/BoxVault/commit/1be8068db53b8c890b52984d0580c53756c88a16))
* implement ISO management features including upload, download, delete, and listing ([9eca54c](https://github.com/Makr91/BoxVault/commit/9eca54c65358adbd57df180080bed41753ed670c))


### Bug Fixes

* enhance SSL upload path validation to prevent traversal attacks ([d2c8c7f](https://github.com/Makr91/BoxVault/commit/d2c8c7f6a66d4fa0b52a256d7b9a55397d359408))

## [0.31.0](https://github.com/Makr91/BoxVault/compare/v0.30.0...v0.31.0) (2026-01-03)


### Features

* add footer component with health status and powered by information ([4692daa](https://github.com/Makr91/BoxVault/commit/4692daab3d16fa593180ee0b1f55f236f5cfdc71))
* add SSL upload functionality and SMTP test feature ([1aadb1a](https://github.com/Makr91/BoxVault/commit/1aadb1a608d541c65cd5f6f6eac8bcedae21398a))
* **i18n:** Normalize language codes and improve fallback settings ([eac5ef8](https://github.com/Makr91/BoxVault/commit/eac5ef89c8d455440bccd9b511c01d8e0f1bed63))
* **react:** Wrap application in Suspense for better loading handling ([eac5ef8](https://github.com/Makr91/BoxVault/commit/eac5ef89c8d455440bccd9b511c01d8e0f1bed63))


### Bug Fixes

* **auth.config:** Add subsection keys for authentication settings ([eac5ef8](https://github.com/Makr91/BoxVault/commit/eac5ef89c8d455440bccd9b511c01d8e0f1bed63))
* **db.config:** Include subsection keys for database configuration ([eac5ef8](https://github.com/Makr91/BoxVault/commit/eac5ef89c8d455440bccd9b511c01d8e0f1bed63))
* **file.service:** Simplify error handling for file upload and assembly processes ([eac5ef8](https://github.com/Makr91/BoxVault/commit/eac5ef89c8d455440bccd9b511c01d8e0f1bed63))
* **mail.config:** Add subsection keys for mail configuration ([eac5ef8](https://github.com/Makr91/BoxVault/commit/eac5ef89c8d455440bccd9b511c01d8e0f1bed63))
* translate backend ([f15a412](https://github.com/Makr91/BoxVault/commit/f15a412be1f57b18214e38b9ba6881d0d4b47796))

## [0.30.0](https://github.com/Makr91/BoxVault/compare/v0.29.0...v0.30.0) (2026-01-03)


### Features

* fix some documentation to trigger build that added true multi org support ([756cb3d](https://github.com/Makr91/BoxVault/commit/756cb3d585c98a7f0e2b3c8e7bc6b6109baada98))

## [0.29.0](https://github.com/Makr91/BoxVault/compare/v0.28.0...v0.29.0) (2026-01-03)


### Features

* update user deletion endpoint and improve organization user management ([0f04bb3](https://github.com/Makr91/BoxVault/commit/0f04bb37460e6fe518a1289d4217f14a6a9e056e))

## [0.28.0](https://github.com/Makr91/BoxVault/compare/v0.27.6...v0.28.0) (2026-01-03)


### Features

* enhance invitation handling and user access management ([2e60f95](https://github.com/Makr91/BoxVault/commit/2e60f950bc417e5a8c0dbf31fad05c5a9d52c2e0))

## [0.27.6](https://github.com/Makr91/BoxVault/compare/v0.27.5...v0.27.6) (2026-01-03)


### Bug Fixes

* all imports must be at the top of the page ([1332a33](https://github.com/Makr91/BoxVault/commit/1332a33defa249a25e7a35fa06a42c47ae5c922c))

## [0.27.5](https://github.com/Makr91/BoxVault/compare/v0.27.4...v0.27.5) (2026-01-03)


### Bug Fixes

* add Swagger documentation for Vagrant box metadata endpoint ([32e184f](https://github.com/Makr91/BoxVault/commit/32e184f4eb8fa78da8281ef45b63312f8bd11c5f))
* improve response handling for Vagrant file downloads ([02ebf18](https://github.com/Makr91/BoxVault/commit/02ebf187cd6b3d639fd8554efab60694c06970fe))

## [0.27.4](https://github.com/Makr91/BoxVault/compare/v0.27.3...v0.27.4) (2026-01-03)


### Bug Fixes

* inline styles to scss ([7d16d09](https://github.com/Makr91/BoxVault/commit/7d16d091f55a02038f66c09ffe044b33dcbe4cf0))
* inline styles to scss ([9f61f5d](https://github.com/Makr91/BoxVault/commit/9f61f5d98ef5460857fde609d0974085a0156b40))
* missing documentation and swagger configs and upating navbar dropdowns ([03f2151](https://github.com/Makr91/BoxVault/commit/03f2151d668893c16224b233d10491ca2dea1ba5))
* missing documentation and swagger configs and upating navbar dropdowns ([1fb10d5](https://github.com/Makr91/BoxVault/commit/1fb10d5bfbfcdfdae964906e5c1497b01fa7866d))

## [0.27.3](https://github.com/Makr91/BoxVault/compare/v0.27.2...v0.27.3) (2026-01-03)


### Bug Fixes

* swagger, documentation, and navbar ([5dcb004](https://github.com/Makr91/BoxVault/commit/5dcb004d5dd4c67237d8c90cb31675aa9d010765))
* table sorting and organization fix ([689d289](https://github.com/Makr91/BoxVault/commit/689d2897155be70eb18278bd4dda3f7dd218723e))

## [0.27.2](https://github.com/Makr91/BoxVault/compare/v0.27.1...v0.27.2) (2026-01-03)


### Bug Fixes

* admin edit org code/all org fields ([63db386](https://github.com/Makr91/BoxVault/commit/63db38647937da38207ea84b4bd6c3a20e29bc6e))

## [0.27.1](https://github.com/Makr91/BoxVault/compare/v0.27.0...v0.27.1) (2026-01-03)


### Bug Fixes

* org modification on admin page and fix page crash on unauthed org view ([21a2138](https://github.com/Makr91/BoxVault/commit/21a213853b3e05778dcd29d2fee517fd76ee3e1c))

## [0.27.0](https://github.com/Makr91/BoxVault/compare/v0.26.28...v0.27.0) (2026-01-03)


### Features

* address issue [#3](https://github.com/Makr91/BoxVault/issues/3) ([f391328](https://github.com/Makr91/BoxVault/commit/f3913286ad4e6a77aabcc33c63e9861fd6fa20f3))


### Bug Fixes

* codeql issue ([8c713cf](https://github.com/Makr91/BoxVault/commit/8c713cf36c83e0aa21040f32080b0359f5957fbe))

## [0.26.28](https://github.com/Makr91/BoxVault/compare/v0.26.27...v0.26.28) (2026-01-01)


### Bug Fixes

* navbar dropdown and os theme detection ([15e50d5](https://github.com/Makr91/BoxVault/commit/15e50d5093cce27aac869516a9d1976f2f1792d4))
* profile toggle for oidc users ([fcd7190](https://github.com/Makr91/BoxVault/commit/fcd719087a872ee0bc6399cd824ba25efd975236))

## [0.26.27](https://github.com/Makr91/BoxVault/compare/v0.26.26...v0.26.27) (2026-01-01)


### Bug Fixes

* profile toggle ([5f8c4cb](https://github.com/Makr91/BoxVault/commit/5f8c4cbdbc77c79a4d7da18c600543efc532e06d))

## [0.26.26](https://github.com/Makr91/BoxVault/compare/v0.26.25...v0.26.26) (2026-01-01)


### Bug Fixes

* profile toggle ([7053699](https://github.com/Makr91/BoxVault/commit/705369991f765e689e0db4b4cd2ec7ca21653c29))

## [0.26.25](https://github.com/Makr91/BoxVault/compare/v0.26.24...v0.26.25) (2026-01-01)


### Bug Fixes

* oidc login endpoint construction ([9105690](https://github.com/Makr91/BoxVault/commit/9105690a8daccad81014d0de28742da19c8ab5ba))

## [0.26.24](https://github.com/Makr91/BoxVault/compare/v0.26.23...v0.26.24) (2026-01-01)


### Bug Fixes

* linting oidc changes ([5e3f500](https://github.com/Makr91/BoxVault/commit/5e3f500575b08642aff7c8bb1b766db0c4636aa2))

## [0.26.23](https://github.com/Makr91/BoxVault/compare/v0.26.22...v0.26.23) (2026-01-01)


### Bug Fixes

* oidc ([8b71983](https://github.com/Makr91/BoxVault/commit/8b7198351a1b1a2fb9cf0c66f6034495b0fa6f7f))

## [0.26.22](https://github.com/Makr91/BoxVault/compare/v0.26.21...v0.26.22) (2026-01-01)


### Bug Fixes

* prettier ([01e4d3f](https://github.com/Makr91/BoxVault/commit/01e4d3f27afa945fc3608f0a7ed36e3378542778))

## [0.26.21](https://github.com/Makr91/BoxVault/compare/v0.26.20...v0.26.21) (2026-01-01)


### Bug Fixes

* package locks again ([2d90c40](https://github.com/Makr91/BoxVault/commit/2d90c40fda1105fae7a4755b62dde952a8b8298f))
* package locks again ([4406817](https://github.com/Makr91/BoxVault/commit/4406817a051d16e1918900ce5f91a202cfe5734b))

## [0.26.20](https://github.com/Makr91/BoxVault/compare/v0.26.19...v0.26.20) (2026-01-01)

### Bug Fixes

- changelog ([6ae7532](https://github.com/Makr91/BoxVault/commit/6ae753210a34112b315e8de879f0012f2ea37f91))
- linting docs/markdown ([7cf75d0](https://github.com/Makr91/BoxVault/commit/7cf75d03dc9d31d488e58f097f56076d6cc4ba73))
- linting docs/markdown ([dc68adf](https://github.com/Makr91/BoxVault/commit/dc68adfd04b5560dc2b7816274ec19aa5c8f3e38))
- linting docs/markdown ([96e3f14](https://github.com/Makr91/BoxVault/commit/96e3f14739fa0cea476880ce26be1516acfba6ed))

## [0.26.19](https://github.com/Makr91/BoxVault/compare/v0.26.18...v0.26.19) (2026-01-01)

### Bug Fixes

- ci/cd ([c8a7bdd](https://github.com/Makr91/BoxVault/commit/c8a7bdd4625bfa09ec445bb00516c4fd234b6722))
- ci/cd ([39fa37d](https://github.com/Makr91/BoxVault/commit/39fa37d743fb9c3f5eb6b17ae5406e558abd7923))
- ci/cd ([f6426fa](https://github.com/Makr91/BoxVault/commit/f6426fac97bd49c99f1c705d26f61b0526f8d946))
- ci/cd ([4e62fb0](https://github.com/Makr91/BoxVault/commit/4e62fb02af3a9155f1d76c0b2d8c54a41af5d929))
- ci/cd linting ([54c5af8](https://github.com/Makr91/BoxVault/commit/54c5af8e86c4bdda88317a92e8b412851a1b46e2))

## [0.26.18](https://github.com/Makr91/BoxVault/compare/v0.26.17...v0.26.18) (2026-01-01)

### Bug Fixes

- package locks ([fe6521c](https://github.com/Makr91/BoxVault/commit/fe6521c5c17eaebedbf219213db3a535579422e5))
- package locks ([96698e5](https://github.com/Makr91/BoxVault/commit/96698e5fc0e8083d74d879d6f19972b5ffdb9237))

## [0.26.17](https://github.com/Makr91/BoxVault/compare/v0.26.16...v0.26.17) (2026-01-01)

### Bug Fixes

- changlog ([adf2d45](https://github.com/Makr91/BoxVault/commit/adf2d4508d9185ba5501f9818cfe0464755ff560))
- codeql express routes --gemini v10 ([0e06d12](https://github.com/Makr91/BoxVault/commit/0e06d121d709f30c2325261e2ef86aa0da7343f1))
- codeql express routes --gemini v10 ([889376c](https://github.com/Makr91/BoxVault/commit/889376c1d402d37dad7f039e900aaa919bb4f52d))
- codeql express routes --gemini v6 ([9cf2bae](https://github.com/Makr91/BoxVault/commit/9cf2baecb5cfbfa7d44f37c937dc4d0fb3269ae6))
- codeql express routes --gemini v7 ([972cb4c](https://github.com/Makr91/BoxVault/commit/972cb4c235ddf681cdf5a10314ca5f9b8258f580))
- codeql express routes --gemini v8 ([1a19849](https://github.com/Makr91/BoxVault/commit/1a19849e183bb7a97dbcc34c9c0528ea5de3b18f))
- codeql express routes --gemini v9 ([dc2658c](https://github.com/Makr91/BoxVault/commit/dc2658c28ff19559207630378fe0ad4a8f5c35c9))
- codeql express routes --gemini v9 ([63d0c24](https://github.com/Makr91/BoxVault/commit/63d0c249ef264d46ecccdb7bc7afa81ebd22c1e6))
- codeql express routes --gemini v9 ([d3f376e](https://github.com/Makr91/BoxVault/commit/d3f376ea65d30c3c890c3ab21af359a8b8c0f75f))
- codeql express routes --gemini v9 ([46002ca](https://github.com/Makr91/BoxVault/commit/46002caa9797cae4b5df6f04b3e1e4bfcea3afd9))
- codeql express routes --gemini v9 ([b8fd5c6](https://github.com/Makr91/BoxVault/commit/b8fd5c6cb1e35d43f36fc6d96846de8a09aaec87))
- navbar render on local login ([483864f](https://github.com/Makr91/BoxVault/commit/483864fa1b199e23df90448017635684a51fcf6e))

## [0.26.16](https://github.com/Makr91/BoxVault/compare/v0.26.15...v0.26.16) (2026-01-01)

### Bug Fixes

- adding ratelimiting ([d88cda7](https://github.com/Makr91/BoxVault/commit/d88cda790d9fbe5e777bcea185dc6da0a15d431e))
- adding Translations foundation ([0b8b04b](https://github.com/Makr91/BoxVault/commit/0b8b04b3b60494d7ac5feeb83225820766653c07))
- app name in console ([7538648](https://github.com/Makr91/BoxVault/commit/7538648a3e7a72eb8b807a458710bde3e84cb30a))
- backend lint ([10f9d6d](https://github.com/Makr91/BoxVault/commit/10f9d6d87f27e566fd4e9203a1c77f8e5d2f3f4d))
- ci/cd ([f61960a](https://github.com/Makr91/BoxVault/commit/f61960ad21e4906f6b01a47362f65dd01442256c))
- codeql express routes ([f60c8b3](https://github.com/Makr91/BoxVault/commit/f60c8b3ef427db401e1f7399b5156edea7906af9))
- codeql express routes ([13756b4](https://github.com/Makr91/BoxVault/commit/13756b437f16ad3490f218543716317dbdd9f741))
- codeql express routes ([3f2cbfc](https://github.com/Makr91/BoxVault/commit/3f2cbfc98ffb2a4f35a70e85b29385a0559e2bcf))
- codeql express routes ([ceff2aa](https://github.com/Makr91/BoxVault/commit/ceff2aa36a960d84229f0219c16a50a75ce571ce))
- codeql express routes ([27dd247](https://github.com/Makr91/BoxVault/commit/27dd247884cea032f0086d605e10141d3fceb0e5))
- codeql express routes ([a3e3246](https://github.com/Makr91/BoxVault/commit/a3e324625a2152275e227e6547e3f5e2b0411ced))
- codeql express routes ([ad96ef4](https://github.com/Makr91/BoxVault/commit/ad96ef4927fc9340fd68e643fe77b42cd5f01ff9))
- codeql express routes ([69e2eca](https://github.com/Makr91/BoxVault/commit/69e2ecabae02f9613ef1ff89e9b43bae2ae750ca))
- codeql express routes ([85445e2](https://github.com/Makr91/BoxVault/commit/85445e2ac1ce2f3408553ee6bf1c90e52df8b71c))
- codeql express routes ([b4e83ab](https://github.com/Makr91/BoxVault/commit/b4e83ab3ebd4ca2904d6d00a9b2002f187bb2e6c))
- codeql express routes ([3abfae5](https://github.com/Makr91/BoxVault/commit/3abfae53e84611361121caa9d04137a113273684))
- codeql express routes ([751aa90](https://github.com/Makr91/BoxVault/commit/751aa90b585f0f48be5b186cca55c9b61df2610f))
- codeql express routes ([78aa36e](https://github.com/Makr91/BoxVault/commit/78aa36e844979178804593f0d382b7225d85b1fc))
- codeql express routes ([573774f](https://github.com/Makr91/BoxVault/commit/573774f1ea8e22cae847ce02aac0ec2bf37d009d))
- codeql express routes ([327bb3d](https://github.com/Makr91/BoxVault/commit/327bb3dd4e3de8c56ed122864032a6f719b87bc3))
- codeql express routes ([a961a75](https://github.com/Makr91/BoxVault/commit/a961a75086a1d7f8e65d82916a280f543611cb68))
- codeql express routes --gemini ([733d676](https://github.com/Makr91/BoxVault/commit/733d676bef6fb378d59e0eb1f203eea1e1151015))
- codeql express routes --gemini v2 ([d9f26bd](https://github.com/Makr91/BoxVault/commit/d9f26bd96c8e6a67609f154317dc1ce848a84813))
- codeql express routes --gemini v3 ([5fc1ce4](https://github.com/Makr91/BoxVault/commit/5fc1ce41f26e698e8b369bbed732a5b6c98901e1))
- codeql express routes --gemini v4 ([fd09ec3](https://github.com/Makr91/BoxVault/commit/fd09ec3c50f8be1cd3df1e7a459bce101a3be9ad))
- codeql express routes --gemini v5 ([d45e90b](https://github.com/Makr91/BoxVault/commit/d45e90bb8afdfd903b2d6fd3edef73b94423e839))
- formatting files with prettier ([84c4367](https://github.com/Makr91/BoxVault/commit/84c4367953da9a5a7c1278e3f31e6912c586b08d))
- install lusca for CSRF ([28c39b4](https://github.com/Makr91/BoxVault/commit/28c39b47621e3864ac550991dfb83fb0dedb81ba))
- lint v2 services and core files ([6a5470a](https://github.com/Makr91/BoxVault/commit/6a5470a2691270e37ad351c35d731b4eb64f9a9b))
- linting frontend v1 ([7260fb8](https://github.com/Makr91/BoxVault/commit/7260fb8dd83a7b71c39475a1e62045f36ccfc9bd))
- linting frontend v3 ([14d6e17](https://github.com/Makr91/BoxVault/commit/14d6e17efdcacd010d2277bced404bb17792b6b7))
- linting, logging, and testing ([ec388a2](https://github.com/Makr91/BoxVault/commit/ec388a2394741bdedac39220bb388fbf04076768))
- main page ([233d30e](https://github.com/Makr91/BoxVault/commit/233d30e5df699e18d1509f1b5781cbb53bd8cfba))
- more codeql path issues ([9311b34](https://github.com/Makr91/BoxVault/commit/9311b34c5323076b81fb28b7d577549373c7980a))
- more codeql path issues ([56414cd](https://github.com/Makr91/BoxVault/commit/56414cde7c098a55e8c64d3eaf4087a6319ce3a1))
- more codeql path issues ([c239a3b](https://github.com/Makr91/BoxVault/commit/c239a3b532c889cb2b681daf8ae63505b908ced7))
- npm scripts ([7d6e050](https://github.com/Makr91/BoxVault/commit/7d6e050218d15d19580bafc7d10257943e0a104d))
- npm scripts ([d0b6446](https://github.com/Makr91/BoxVault/commit/d0b644662fd379638dfee8b35311042432103bd8))
- path validations ([7850af6](https://github.com/Makr91/BoxVault/commit/7850af64780e9890aff15031a7c0fe8d96987100))
- ratelimiting ([59b7ce8](https://github.com/Makr91/BoxVault/commit/59b7ce8a488ff269535b0b905a1a71b698f79d93))
- redirect. codeql ([3eb16c2](https://github.com/Makr91/BoxVault/commit/3eb16c2376a941da877ebccb2f11f52860ec36cf))
- response time ([74b18c3](https://github.com/Makr91/BoxVault/commit/74b18c3d8d0ee2203f5cec57a046a72ba986bf5f))

## [0.26.15](https://github.com/Makr91/BoxVault/compare/v0.26.14...v0.26.15) (2025-12-29)

### Bug Fixes

- NavMenu ([860fba4](https://github.com/Makr91/BoxVault/commit/860fba451fdf61c097965207d7ee5bb4ea709d3a))

## [0.26.14](https://github.com/Makr91/BoxVault/compare/v0.26.13...v0.26.14) (2025-12-29)

### Bug Fixes

- disable omnios builds and udpate favorites and ticketing system ([d4d4756](https://github.com/Makr91/BoxVault/commit/d4d475620c2832d9f4073f94f85672fd9f87fc42))
- NavMenu ([e52300e](https://github.com/Makr91/BoxVault/commit/e52300e90e8f04726838fdb471273a783d38b80a))

## [0.26.13](https://github.com/Makr91/BoxVault/compare/v0.26.12...v0.26.13) (2025-12-29)

### Bug Fixes

- disable omnios builds and udpate favorites and ticketing system ([809b01e](https://github.com/Makr91/BoxVault/commit/809b01ecdd116b543e7b0f21d2414606709bc2cf))

## [0.26.12](https://github.com/Makr91/BoxVault/compare/v0.26.11...v0.26.12) (2025-12-29)

### Bug Fixes

- disable omnios builds and udpate favorites and ticketing system ([105eade](https://github.com/Makr91/BoxVault/commit/105eadeaac34c07137d8b30904683b6d2f9e33db))

## [0.26.11](https://github.com/Makr91/BoxVault/compare/v0.26.10...v0.26.11) (2025-12-29)

### Bug Fixes

- disable omnios builds and udpate favorites and ticketing system ([b8e6fc6](https://github.com/Makr91/BoxVault/commit/b8e6fc6825d6e3370e1171caf96205405a5a0792))

## [0.26.10](https://github.com/Makr91/BoxVault/compare/v0.26.9...v0.26.10) (2025-12-29)

### Bug Fixes

- disable omnios builds and udpate favorites and ticketing system ([78f18b9](https://github.com/Makr91/BoxVault/commit/78f18b9c8931ec3098de4be31d8d011df4b2d591))

## [0.26.9](https://github.com/Makr91/BoxVault/compare/v0.26.8...v0.26.9) (2025-12-29)

### Bug Fixes

- disable omnios builds and udpate favorites and ticketing system ([dcc5d1c](https://github.com/Makr91/BoxVault/commit/dcc5d1c044510a28f4e4d6c0acf577c37f326a6c))

## [0.26.8](https://github.com/Makr91/BoxVault/compare/v0.26.7...v0.26.8) (2025-12-29)

### Bug Fixes

- disable omnios builds and udpate favorites and ticketing system ([f6d2bc1](https://github.com/Makr91/BoxVault/commit/f6d2bc1c596f7c957ba32c9a341f7e3a337ff25c))

## [0.26.7](https://github.com/Makr91/BoxVault/compare/v0.26.6...v0.26.7) (2025-12-29)

### Bug Fixes

- dependencies ([e12e106](https://github.com/Makr91/BoxVault/commit/e12e106864b83a7810e02d9b0ff302618bb39555))
- dependencies ([2c2e119](https://github.com/Makr91/BoxVault/commit/2c2e119eb4ae669dfdedbed2bd28375a635e8eb9))

## [0.26.6](https://github.com/Makr91/BoxVault/compare/v0.26.5...v0.26.6) (2025-12-29)

### Bug Fixes

- logout icon ([e103a9b](https://github.com/Makr91/BoxVault/commit/e103a9bbe7c343d9c348942a8b62ab2017711f0c))

## [0.26.5](https://github.com/Makr91/BoxVault/compare/v0.26.4...v0.26.5) (2025-12-29)

### Bug Fixes

- logout icon ([61e7269](https://github.com/Makr91/BoxVault/commit/61e7269af9873561f9d217e1367bd0b6e0123d19))
- logout icon ([8538ff4](https://github.com/Makr91/BoxVault/commit/8538ff45da37d1aa94ea4038564ddae26f0367eb))
- updating CI/CD ([21b94f8](https://github.com/Makr91/BoxVault/commit/21b94f8ee0e40e252fbe768cd3c47b5a46c44341))

## [0.26.4](https://github.com/Makr91/BoxVault/compare/v0.26.3...v0.26.4) (2025-12-29)

### Bug Fixes

- oidc logout ([5a111ed](https://github.com/Makr91/BoxVault/commit/5a111ed10d04c9910c24fda1a59aca1fdb5efda3))

## [0.26.3](https://github.com/Makr91/BoxVault/compare/v0.26.2...v0.26.3) (2025-12-28)

### Bug Fixes

- actions ([20f2b60](https://github.com/Makr91/BoxVault/commit/20f2b60be45ba1623b25ff2fce587e7c29d912c8))

## [0.26.2](https://github.com/Makr91/BoxVault/compare/v0.26.1...v0.26.2) (2025-12-28)

### Bug Fixes

- actions ([5ae327b](https://github.com/Makr91/BoxVault/commit/5ae327b49fe164cca3ba14dbd6eba351cab1db77))

## [0.26.1](https://github.com/Makr91/BoxVault/compare/v0.26.0...v0.26.1) (2025-12-28)

### Bug Fixes

- default providers to {} ([93b43d1](https://github.com/Makr91/BoxVault/commit/93b43d1851471c741d2d431f54e7b42c95594d18))
- dev environments use dev config files ([74efbf2](https://github.com/Makr91/BoxVault/commit/74efbf235c929bfb345fa8e2674bb69527825e67))
- early linting and updating OIDC ([6d1140b](https://github.com/Makr91/BoxVault/commit/6d1140b2643b898a107c83358768abaa37883e37))
- uploads ([5f8ab06](https://github.com/Makr91/BoxVault/commit/5f8ab063f3321e563e8c472e353cf19317716267))

## [0.26.0](https://github.com/Makr91/BoxVault/compare/v0.25.0...v0.26.0) (2025-09-22)

### Features

- convert to winston logging ([6e46d13](https://github.com/Makr91/BoxVault/commit/6e46d1348e3c46f84116da57b06a0c1f6f872033))

## [0.25.0](https://github.com/Makr91/BoxVault/compare/v0.24.0...v0.25.0) (2025-09-21)

### Features

- convert to winston logging ([06644d1](https://github.com/Makr91/BoxVault/commit/06644d1c65f04c1672c55d3b1db2ebd7ab7db712))
- convert to winston logging ([835b7fe](https://github.com/Makr91/BoxVault/commit/835b7fe41173da11a4df0284e8aba07f5fbffeeb))
- convert to winston logging ([06316f4](https://github.com/Makr91/BoxVault/commit/06316f4df8cfa83964c052269757dcb5a5c38e6e))

## [0.24.0](https://github.com/Makr91/BoxVault/compare/v0.23.1...v0.24.0) (2025-09-21)

### Features

- github ci/cd ([2845044](https://github.com/Makr91/BoxVault/commit/2845044e78372bae2ac9e899cd28479e43ac28f3))
- update express ([0751b83](https://github.com/Makr91/BoxVault/commit/0751b837c14604a64a7b57e5937cbd96b28fa9a7))

### Bug Fixes

- org change frontend ([becbe70](https://github.com/Makr91/BoxVault/commit/becbe70eefcf2b3cd7e2f9dd40f74e26fa0c9a97))

## [0.23.1](https://github.com/Makr91/BoxVault/compare/v0.23.0...v0.23.1) (2025-09-21)

### Bug Fixes

- organization rename ([6d84f58](https://github.com/Makr91/BoxVault/commit/6d84f58ea2c4b5d87dfb019d9341cc151145cd74))

## [0.23.0](https://github.com/Makr91/BoxVault/compare/v0.22.0...v0.23.0) (2025-09-20)

### Features

- oidc ([f8886d8](https://github.com/Makr91/BoxVault/commit/f8886d801281e526cc0c87becc891844386360f1))

## [0.22.0](https://github.com/Makr91/BoxVault/compare/v0.21.0...v0.22.0) (2025-09-19)

### Features

- oidc ([381ad60](https://github.com/Makr91/BoxVault/commit/381ad60016376ecf075f47328925d6d84c79cdd1))
- oidc ([20b133b](https://github.com/Makr91/BoxVault/commit/20b133bf572faf4bf634b528e41684fe14993901))

## [0.21.0](https://github.com/Makr91/BoxVault/compare/v0.20.0...v0.21.0) (2025-09-19)

### Features

- oidc ([a8d95ca](https://github.com/Makr91/BoxVault/commit/a8d95caaa3d066d939d7c43b156bf6c1029e45c3))
- oidc ([c6396ae](https://github.com/Makr91/BoxVault/commit/c6396aea18b8445524a5113bce702a4215642eeb))

## [0.20.0](https://github.com/Makr91/BoxVault/compare/v0.19.16...v0.20.0) (2025-09-19)

### Features

- oidc ([f6e6621](https://github.com/Makr91/BoxVault/commit/f6e66216ff4b6f3b0e9a9ce346bac601a0231774))

### Bug Fixes

- consolidate DEBIAN packaging ([4c8562f](https://github.com/Makr91/BoxVault/commit/4c8562fb3cd0b18f85e07084c3497a341ea103c7))
- remove react table ([22fdec7](https://github.com/Makr91/BoxVault/commit/22fdec77afd00858900aa06e20dd294b757b70b9))

## [0.19.16](https://github.com/Makr91/BoxVault/compare/v0.19.15...v0.19.16) (2025-08-16)

### Bug Fixes

- remove react table ([9b19517](https://github.com/Makr91/BoxVault/commit/9b1951757be8600c8b7e1b868f75e36ebb10a4f7))

## [0.19.15](https://github.com/Makr91/BoxVault/compare/v0.19.14...v0.19.15) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v18 - preventing conf overwrites ([e4bb261](https://github.com/Makr91/BoxVault/commit/e4bb261ac515ff4591fee1e4e3592ed9d951d46c))

## [0.19.14](https://github.com/Makr91/BoxVault/compare/v0.19.13...v0.19.14) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v17 - preventing conf overwrites ([11f46ba](https://github.com/Makr91/BoxVault/commit/11f46ba632b1db967f052996a4a2a22431bc091e))

## [0.19.13](https://github.com/Makr91/BoxVault/compare/v0.19.12...v0.19.13) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v15 - preventing conf overwrites ([2eb7eae](https://github.com/Makr91/BoxVault/commit/2eb7eae683c433c021cdae0e5d9cbf8e3bb87852))
- selectable sql dialect/backend v16 - preventing conf overwrites ([83eb1ec](https://github.com/Makr91/BoxVault/commit/83eb1ec0831b2222293d825ce61ff7ec8d199abe))

## [0.19.12](https://github.com/Makr91/BoxVault/compare/v0.19.11...v0.19.12) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v13 - cerbothook ([1b21cd2](https://github.com/Makr91/BoxVault/commit/1b21cd2203876d711550b96c812e0ca60f69a8b1))

## [0.19.11](https://github.com/Makr91/BoxVault/compare/v0.19.10...v0.19.11) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v13 ([fb8b529](https://github.com/Makr91/BoxVault/commit/fb8b529fea3d1a7e5ddfb8e606ea737cf7d96b16))

## [0.19.10](https://github.com/Makr91/BoxVault/compare/v0.19.9...v0.19.10) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v12 ([f7040a0](https://github.com/Makr91/BoxVault/commit/f7040a05789d001e3c91b7af9a6e684477e303b6))

## [0.19.9](https://github.com/Makr91/BoxVault/compare/v0.19.8...v0.19.9) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v11 ([3bf336b](https://github.com/Makr91/BoxVault/commit/3bf336b6628679d3cee4e14bd641108dad9dccdd))

## [0.19.8](https://github.com/Makr91/BoxVault/compare/v0.19.7...v0.19.8) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v10 ([f9f9fd5](https://github.com/Makr91/BoxVault/commit/f9f9fd52301f0378626d6aa7c225d47fd6e20f57))

## [0.19.7](https://github.com/Makr91/BoxVault/compare/v0.19.6...v0.19.7) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v9 ([29c313c](https://github.com/Makr91/BoxVault/commit/29c313c9c51b722f52c2822a167704eb7c924ae5))

## [0.19.6](https://github.com/Makr91/BoxVault/compare/v0.19.5...v0.19.6) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v8 ([d8ec6b7](https://github.com/Makr91/BoxVault/commit/d8ec6b7b3c3217e7152d1697861da51dd1020844))

## [0.19.5](https://github.com/Makr91/BoxVault/compare/v0.19.4...v0.19.5) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v6 ([920046b](https://github.com/Makr91/BoxVault/commit/920046be49869a6aa95405d5f7787091344958ff))
- selectable sql dialect/backend v7 ([8553b73](https://github.com/Makr91/BoxVault/commit/8553b736d6c8dc190010633ac55f9879b0d1b9cd))

## [0.19.4](https://github.com/Makr91/BoxVault/compare/v0.19.3...v0.19.4) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v5 ([0e067d0](https://github.com/Makr91/BoxVault/commit/0e067d0c7f4339e812b63fa90c39e1b09e00452b))

## [0.19.3](https://github.com/Makr91/BoxVault/compare/v0.19.2...v0.19.3) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v3 ([e52ace7](https://github.com/Makr91/BoxVault/commit/e52ace7ab8a185a3a7d416a5079c7a8911372c57))
- selectable sql dialect/backend v4 ([baa02ea](https://github.com/Makr91/BoxVault/commit/baa02ea9b670d8a358a3b5b0139400c1e529ab5a))

## [0.19.2](https://github.com/Makr91/BoxVault/compare/v0.19.1...v0.19.2) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend v2 ([daea3f1](https://github.com/Makr91/BoxVault/commit/daea3f1386ea1077126126026abf458fb8acd2eb))

## [0.19.1](https://github.com/Makr91/BoxVault/compare/v0.19.0...v0.19.1) (2025-08-16)

### Bug Fixes

- selectable sql dialect/backend ([3ddbbe3](https://github.com/Makr91/BoxVault/commit/3ddbbe3277ae6492790eda3211e7bae3d5934cc4))

## [0.19.0](https://github.com/Makr91/BoxVault/compare/v0.18.0...v0.19.0) (2025-08-16)

### Features

- selectable sql dialect/backend ([47a955f](https://github.com/Makr91/BoxVault/commit/47a955f445239ac2ec40fb90aa8e2db22551f1cd))

## [0.18.0](https://github.com/Makr91/BoxVault/compare/v0.17.10...v0.18.0) (2025-08-16)

### Features

- selectable sql dialect/backend ([b2fee0f](https://github.com/Makr91/BoxVault/commit/b2fee0fc0245a5b5121e7c54e07ec629901957ad))

## [0.17.10](https://github.com/Makr91/BoxVault/compare/v0.17.9...v0.17.10) (2025-08-16)

### Bug Fixes

- documentation, packaging v38 ([e286477](https://github.com/Makr91/BoxVault/commit/e286477f8b2dd48867cf310e3c26fdd87f251527))

## [0.17.9](https://github.com/Makr91/BoxVault/compare/v0.17.8...v0.17.9) (2025-08-16)

### Bug Fixes

- documentation, packaging v37 ([0aeefc9](https://github.com/Makr91/BoxVault/commit/0aeefc9038dfbaab4fccd682f2b5151dcdc4b07f))

## [0.17.8](https://github.com/Makr91/BoxVault/compare/v0.17.7...v0.17.8) (2025-08-16)

### Bug Fixes

- documentation, packaging v36 ([ccffe4b](https://github.com/Makr91/BoxVault/commit/ccffe4b6693eae2ac272ab3ab6f4b5d5ea5b3c54))

## [0.17.7](https://github.com/Makr91/BoxVault/compare/v0.17.6...v0.17.7) (2025-08-16)

### Bug Fixes

- documentation, packaging v35 ([ae10f76](https://github.com/Makr91/BoxVault/commit/ae10f76a6d79d565dd97ab688e2f362a17280bab))

## [0.17.6](https://github.com/Makr91/BoxVault/compare/v0.17.5...v0.17.6) (2025-08-16)

### Bug Fixes

- documentation, packaging v34 - omnios ([739bece](https://github.com/Makr91/BoxVault/commit/739bece14e6986dcd2cea49b81e2191fad3ded6d))

## [0.17.5](https://github.com/Makr91/BoxVault/compare/v0.17.4...v0.17.5) (2025-08-16)

### Bug Fixes

- documentation, packaging v29 ([718b51f](https://github.com/Makr91/BoxVault/commit/718b51fbbd204475f4b8c8a08f13051322b1a814))
- documentation, packaging v32 ([1251fd4](https://github.com/Makr91/BoxVault/commit/1251fd44e072cbc2031255b97ef87117efcb59a1))
- documentation, packaging v33 ([0b3f683](https://github.com/Makr91/BoxVault/commit/0b3f683edd9c091c2c4ae9572f304977cc34bd06))

## [0.17.4](https://github.com/Makr91/BoxVault/compare/v0.17.3...v0.17.4) (2025-08-16)

### Bug Fixes

- documentation, packaging v15 ([26acb9b](https://github.com/Makr91/BoxVault/commit/26acb9b0b222485b7f2fc668fc66c2f2214ac18a))
- documentation, packaging v15 ([4528137](https://github.com/Makr91/BoxVault/commit/4528137087990447dd2b66b713206742554e96a9))
- documentation, packaging v16 ([98349ad](https://github.com/Makr91/BoxVault/commit/98349ad8400c10ae26b49e183fb0af518798e256))
- documentation, packaging v17 ([b52b1e9](https://github.com/Makr91/BoxVault/commit/b52b1e9acbffcd01f170c698b8e88dd8180d8a8f))
- documentation, packaging v18 ([6149c04](https://github.com/Makr91/BoxVault/commit/6149c04254e1ade60f91935e212950cb399777c7))
- documentation, packaging v19 ([5685e5d](https://github.com/Makr91/BoxVault/commit/5685e5dc1e20ba1526089260d24c42b73ecda20e))
- documentation, packaging v19 ([f792e4a](https://github.com/Makr91/BoxVault/commit/f792e4a5f8db4053f6dab0be8895b49d88ad57b3))
- documentation, packaging v20 ([931174c](https://github.com/Makr91/BoxVault/commit/931174c5c0f0cb0648be6a9741f5ec798bd6dd20))
- documentation, packaging v21 ([008d1ba](https://github.com/Makr91/BoxVault/commit/008d1baacba3973bd6fc05048b5695a990a31b17))
- documentation, packaging v22 ([0ad946d](https://github.com/Makr91/BoxVault/commit/0ad946d4b3e00dac7e4d1652bcf820e87985c995))
- documentation, packaging v23 ([12176ae](https://github.com/Makr91/BoxVault/commit/12176ae8440a60225708f473fd2b26e86617ef38))
- documentation, packaging v24 ([f949aee](https://github.com/Makr91/BoxVault/commit/f949aee26b5ebd2cb0cba9489cbf9cf185d0be1a))
- documentation, packaging v25 ([974fa5d](https://github.com/Makr91/BoxVault/commit/974fa5ddb19324537842b65df131db9c188f62c7))
- documentation, packaging v26 ([0ad029b](https://github.com/Makr91/BoxVault/commit/0ad029ba9137f7ad99624cff16f8dd7253d2aa64))
- documentation, packaging v27 ([c2a9188](https://github.com/Makr91/BoxVault/commit/c2a9188a1637b7c1565ff001133fcef4c758e940))
- documentation, packaging v28 ([c9ec092](https://github.com/Makr91/BoxVault/commit/c9ec092f280f2c51b92eb0d45c42a145d0d9b5dc))
- documentation, packaging v29 ([3e95229](https://github.com/Makr91/BoxVault/commit/3e9522910370700cd71c7b70b8d26ae80d4d692c))

## [0.17.3](https://github.com/Makr91/BoxVault/compare/v0.17.2...v0.17.3) (2025-08-16)

### Bug Fixes

- documentation, packaging v14 ([b585fad](https://github.com/Makr91/BoxVault/commit/b585fad3599133194362f47aee81a86eed6ed440))

## [0.17.2](https://github.com/Makr91/BoxVault/compare/v0.17.1...v0.17.2) (2025-08-16)

### Bug Fixes

- documentation, packaging v13 ([265ea2d](https://github.com/Makr91/BoxVault/commit/265ea2d40633c01e73e3467ab3d3acd5bba9eae7))

## [0.17.1](https://github.com/Makr91/BoxVault/compare/v0.17.0...v0.17.1) (2025-08-16)

### Bug Fixes

- documentation, packaging v12 ([682df6e](https://github.com/Makr91/BoxVault/commit/682df6efb765ec7e939065c0d72a8da0f8a92464))

## [0.17.0](https://github.com/Makr91/BoxVault/compare/v0.16.0...v0.17.0) (2025-08-16)

### Features

- documentation, packaging v12 ([d45c427](https://github.com/Makr91/BoxVault/commit/d45c427b667d34a43d1b17916cf55064957eae50))

## [0.16.0](https://github.com/Makr91/BoxVault/compare/v0.15.0...v0.16.0) (2025-08-16)

### Features

- documentation, packaging v11 ([a947ff8](https://github.com/Makr91/BoxVault/commit/a947ff8b29b7b5e39cb8bea1eea85f3026a6898e))

## [0.15.0](https://github.com/Makr91/BoxVault/compare/v0.14.0...v0.15.0) (2025-08-16)

### Features

- documentation, packaging v10 ([8279ea2](https://github.com/Makr91/BoxVault/commit/8279ea2728b3fd67bd92854ba5cdb85be1ebb68f))
- documentation, packaging v9 ([1893ff6](https://github.com/Makr91/BoxVault/commit/1893ff6ff1221df5b08150c6f2bb6d9500a8d53d))

## [0.14.0](https://github.com/Makr91/BoxVault/compare/v0.13.0...v0.14.0) (2025-08-16)

### Features

- documentation, packaging v7 ([3fa4a29](https://github.com/Makr91/BoxVault/commit/3fa4a290ae206be45aed171cc32350bc8b293677))
- documentation, packaging v8 ([cf0eea4](https://github.com/Makr91/BoxVault/commit/cf0eea45e3425fad406f8a3b6c5df4bacc1c7aa3))

## [0.13.0](https://github.com/Makr91/BoxVault/compare/v0.12.0...v0.13.0) (2025-08-16)

### Features

- documentation, packaging v6 ([e15c53d](https://github.com/Makr91/BoxVault/commit/e15c53d7fe6e62f7569db4ff49ead52526a540b9))

## [0.12.0](https://github.com/Makr91/BoxVault/compare/v0.11.0...v0.12.0) (2025-08-16)

### Features

- documentation, packaging v5 ([3569bbe](https://github.com/Makr91/BoxVault/commit/3569bbe022e522251ce81c72f53766b4c0331aef))

## [0.11.0](https://github.com/Makr91/BoxVault/compare/v0.10.0...v0.11.0) (2025-08-16)

### Features

- documentation, packaging v4 ([b960b8d](https://github.com/Makr91/BoxVault/commit/b960b8d4a0de60183c33ca050273c9b78c16cf39))

## [0.10.0](https://github.com/Makr91/BoxVault/compare/v0.9.0...v0.10.0) (2025-08-16)

### Features

- documentation, packaging v3 ([e15d99d](https://github.com/Makr91/BoxVault/commit/e15d99d376101e8f4bced2fc58ae7ce86cf13dff))

## [0.9.0](https://github.com/Makr91/BoxVault/compare/v0.8.0...v0.9.0) (2025-08-16)

### Features

- documentation, packaging v2 ([e4f4b16](https://github.com/Makr91/BoxVault/commit/e4f4b163ec1d91fb77b17140a254e0d47395a856))

## [0.8.0](https://github.com/Makr91/BoxVault/compare/v0.7.2...v0.8.0) (2025-08-16)

### Features

- documentation, packaging ([35762c5](https://github.com/Makr91/BoxVault/commit/35762c5b285b40d2cee9934fbab028924e0cd098))

### Bug Fixes

- Authentication ([0a2c538](https://github.com/Makr91/BoxVault/commit/0a2c5388025590fdf0f202260f6fea4b99e5bf78))

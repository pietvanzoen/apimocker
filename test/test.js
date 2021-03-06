/* global describe, it, beforeEach, afterEach, after */

// run "grunt test", or run "mocha" in this test directory to execute.
describe('unit tests: ', function() {
  var chai = require("chai"),  // better assertions than node offers.
      apiMocker = require("../lib/apimocker.js"),
      path = require("path"),
      fs = require("fs"),
      express,
      assert = chai.assert,
      expect = chai.expect,
      sinon = require("sinon"),
      oldTestConfig = {
          "mockDirectory": "foo/bar/samplemocks/",
          "quiet": true,
          "port": "7879",
          "latency": 50,
          "allowedDomains": ["abc"],
          "webServices": {
              "get": {
                  "first": "king.json",
                  "nested/ace": "ace.json",
                  "var/:id": "xml/queen.xml"
              },
              "post": {
                  "first": "king.json"
              },
              "all": {
                  "queen": "xml/queen.xml"
              }
          }
      },
      testConfig = {
          "mockDirectory": "foo/bar/samplemocks/",
          "quiet": true,
          "port": "7879",
          "latency": 50,
          "allowedDomains": ["abc"],
          "webServices": {
            "first": {
              "mockFile": "king.json",
              "verbs": ["get","post"]
            },
            "nested/ace": {
              "mockFile": "ace.json",
              "verbs": ["get"]
            },
            "var/:id": {
              "mockFile": "xml/queen.xml",
              "verbs": ["get"]
            },
            "queen": {
              "mockFile": "xml/queen.xml",
              "verbs": ["all"]
            }
          }
      };
      chai.Assertion.includeStack = true;

  describe('createServer: ', function() {
    it('sets defaults when no options are passed in', function() {
      var mocker = apiMocker.createServer();
      expect(mocker.options.port).to.equal("8888");
      expect(mocker.options.mockDirectory).to.equal("./mocks/");
      expect(mocker.options.allowedDomains.length).to.equal(1);
      expect(mocker.options.allowedDomains[0]).to.equal("*");
      expect(mocker.options.quiet).to.equal(undefined);
    });

    it('overrides defaults with command line args', function() {
      var mocker = apiMocker.createServer({port:1234, quiet: true, foo: "bar"});
      expect(mocker.options.port).to.equal(1234);
      expect(mocker.options.mockDirectory).to.equal("./mocks/");
      expect(mocker.options.allowedDomains[0]).to.equal("*");
      expect(mocker.options.quiet).to.equal(true);
      expect(mocker.options.foo).to.equal("bar");
    });
  });

  describe('setConfigFile: ', function() {
    var mocker = apiMocker.createServer();

    beforeEach(function() {
      delete mocker.configFilePath;
    });

    after(function() {
      delete mocker.configFilePath;
    });

    it('should set a relative path correctly using node path resolver', function() {
      // var mocker = apiMocker.createServer();
      assert.equal(path.resolve("../config.json"), apiMocker.setConfigFile("../config.json").configFilePath);
    });

    it('should set an absolute path correctly', function() {
      var absolutePath = "/foo/bar/config.json";
      expect(apiMocker.setConfigFile(absolutePath).configFilePath).to.equal(absolutePath);
    });

    it('sets no path, if none is passed in', function() {
      expect(apiMocker.setConfigFile().configFilePath).to.equal(undefined);
    });
  });

  describe("loadConfigFile: ", function() {
    var fsStub;

    beforeEach(function createFsStub() {
      fsStub = sinon.stub(fs, "readFileSync");  // fsStub is a function
    });

    afterEach(function restoreFs() {
      fsStub.restore();
    });

    it("sets options from new format mock config file", function() {
      var mocker = apiMocker.createServer({quiet: true});
      fsStub.returns(JSON.stringify(testConfig));
      mocker.setConfigFile("any value");
      mocker.loadConfigFile();
      expect(mocker.options.port).to.equal(testConfig.port);
      expect(mocker.options.mockDirectory).to.equal(testConfig.mockDirectory);
      expect(mocker.options.allowedDomains[0]).to.equal(testConfig.allowedDomains[0]);
      expect(mocker.options.webServices).to.deep.equal(testConfig.webServices);
      expect(mocker.options.quiet).to.equal(true);
      expect(mocker.options.latency).to.equal(testConfig.latency);
    });

    it("sets options from old format mock in-memory config file, stores in new format", function() {
      var mocker = apiMocker.createServer({quiet: true});
      fsStub.returns(JSON.stringify(oldTestConfig));
      mocker.setConfigFile("any value");

      mocker.loadConfigFile();
      expect(mocker.options.port).to.equal(oldTestConfig.port);
      expect(mocker.options.mockDirectory).to.equal(oldTestConfig.mockDirectory);
      expect(mocker.options.allowedDomains[0]).to.equal(oldTestConfig.allowedDomains[0]);
      expect(mocker.options.webServices).to.deep.equal(testConfig.webServices);
      expect(mocker.options.quiet).to.equal(true);
      expect(mocker.options.latency).to.equal(oldTestConfig.latency);
    });

    it("combines values from defaults, options, and config file", function() {
      var mocker = apiMocker.createServer({quiet: true, test: "fun", port: 2323});
      fsStub.returns(JSON.stringify({port: 8765, latency: 99}));
      mocker = mocker.setConfigFile("another abitrary value");

      mocker.loadConfigFile();
      // value from config file
      expect(mocker.options.port).to.equal(8765);
      expect(mocker.options.latency).to.equal(99);
      // value from defaults
      expect(mocker.options.allowedDomains[0]).to.equal("*");
      expect(mocker.options.webServices).to.deep.equal(mocker.defaults.webServices);
      // value from options passed in to createServer:
      expect(mocker.options.test).to.equal("fun");
    });
  });

  describe("setMockFile: ", function() {
    var mocker, svcOptions, reqStub;

    beforeEach(function createMocker() {
      mocker = apiMocker.createServer({quiet: true});
      svcOptions = {switch: "productId", mockFile: "base"};
      reqStub = {
        param: function() {return null;},
        body: {}
      };
    });

    it("does not set mock file path if switch is not found in request", function() {
      mocker.setMockFile(svcOptions, reqStub);
      expect(svcOptions.mockFile).to.equal("base");
    });

    it("sets correct mock file path if switch is found in query string", function() {
      reqStub.param = function() {return "123";};
      mocker.setMockFile(svcOptions, reqStub);
      expect(svcOptions.mockFile).to.equal("productId123.base");
    });

    it("sets correct mock file path if switch is found in json body", function() {
      reqStub.body.productId = "678";
      mocker.setMockFile(svcOptions, reqStub);
      expect(svcOptions.mockFile).to.equal("productId678.base");
    });

    it("sets correct mock file path with switch and nested path", function() {
      reqStub.body.productId="678";
      svcOptions.mockFile = "path/to/base";
      mocker.setMockFile(svcOptions, reqStub);
      expect(svcOptions.mockFile).to.equal("path/to/productId678.base");
    });
  });

  describe("setRoute:", function() {
    var am = apiMocker.createServer();

    it("sets http status code to 200 by default", function() {
      var options = {
        verb: "get",
        latency: 0,
        serviceUrl: "foo.com",
        mockFile: "file.json"
      };
      am.setRoute(options);
      expect(options.httpStatus).to.equal(200);
    });
  });

  describe("setRoutes:", function() {
    var am = apiMocker.createServer(),
        setRouteMock;

    beforeEach(function () {
      setRouteMock = sinon.mock(am, "setRoute");
    });

    afterEach(function restoreFs() {
      setRouteMock.restore();
    });

    it("calls setRoute with a simple service definition", function() {
      var webServices = {
        "first": {
          "mockFile": "king.json",
          "latency": 20,
          "verbs": ["get", "post"]
        }
      };
      setRouteMock.expects("setRoute").withExactArgs({ latency: 20, mockFile: "king.json", serviceUrl: "first", verb: "get" });
      setRouteMock.expects("setRoute").withExactArgs({ latency: 20, mockFile: "king.json", serviceUrl: "first", verb: "post" });
      am.setRoutes(webServices);
      setRouteMock.verify();
    });

    it("calls setRoute with complex service definition", function() {
      var webServices = {
        "second": {
          "verbs": ["delete", "post"],
          "responses": {
            "delete": {"httpStatus": 204},
            "post": {
              "contentType": "foobar",
              "mockFile": "king.json"
            }
          }
        }
      };

      setRouteMock.expects("setRoute").withExactArgs({ httpStatus: 204, latency: 0, serviceUrl: "second", verb: "delete" });
      setRouteMock.expects("setRoute").withExactArgs({ latency: 0, serviceUrl: "second", verb: "post", contentType: "foobar", mockFile: "king.json" });
      am.setRoutes(webServices);
      setRouteMock.verify();
    });
  });

});
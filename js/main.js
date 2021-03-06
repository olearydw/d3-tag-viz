require([
  "d3", "lodash", "portal/portal",
  "esri/arcgis/OAuthInfo", "esri/IdentityManager", "dojo/on"
], function (d3, _, portal, arcgisOAuthInfo, esriId, on) {

  var app = {};

  document.getElementById("search").onclick = function() {
    document.getElementById("graph").innerHTML = "";
    var query = document.getElementById("searchString").value;
    doSearch(query);
  };

  document.getElementById("logout").onclick = function() {
    sessionStorage.clear();
    window.location.reload();
  };

  ////////////////////////////////////////////////////////////////////////////
  // *** ArcGIS OAuth ***
  ////////////////////////////////////////////////////////////////////////////
  var appInfo = new arcgisOAuthInfo({
    appId: "10PPN9pnELlXgsZR",
    popup: true
  });
  esriId.registerOAuthInfos([appInfo]);
  esriId.getCredential(appInfo.portalUrl, {
    oAuthPopupConfirmation: false
  }).then(function (user) {
    app.user = user;
    doSearch("");
  });
  ////////////////////////////////////////////////////////////////////////////

  function doSearch(query) {

    if (query === "") {
      query = "owner:" + app.user.userId;
    }

    var allTags = [];

    // Run the search and get all the tags.
    portal.search(app.user.server + "/", query, 100, "", "", "", app.user.token).then(function (results) {
      console.log(results.length + " results");
      document.getElementById("label").innerHTML = results.length + " results for " + query;
      var items = _.pluck(results, "tags");
      _.forEach(items, function (tags) {
        _.forEach(tags, function (tag) {
          var tagIndex = _.findIndex(allTags, {
            "name": tag
          });
          if (tagIndex !== -1) {
            var existingTags = allTags[tagIndex].imports;
            allTags[tagIndex].imports = _.union(existingTags, _.without(tags, tag));
          } else {
            allTags.push({
              "name": tag,
              "imports": _.without(tags, tag)
            });
          }
        });
      });
      drawIt(allTags);
    });
  }

  function drawIt(data) {

    var diameter = 960,
      radius = diameter / 2,
      innerRadius = radius - 120;

    var cluster = d3.layout.cluster()
      .size([360, innerRadius])
      .sort(null)
      .value(function (d) {
        return d.size;
      });

    var bundle = d3.layout.bundle();

    var line = d3.svg.line.radial()
      .interpolate("bundle")
      .tension(0.85)
      .radius(function (d) {
        return d.y;
      })
      .angle(function (d) {
        return d.x / 180 * Math.PI;
      });

    var svg = d3.select("#graph").append("svg")
      .attr("width", diameter)
      .attr("height", diameter)
      .append("g")
      .attr("transform", "translate(" + radius + "," + radius + ")");

    var link = svg.append("g").selectAll(".link"),
      node = svg.append("g").selectAll(".node");

    var nodes = cluster.nodes(packageHierarchy(data)),
      links = packageImports(nodes);

    link = link
      .data(bundle(links))
      .enter().append("path")
      .each(function (d) {
        d.source = d[0];
        d.target = d[d.length - 1];
      })
      .attr("class", "link")
      .attr("d", line);

    node = node
      .data(nodes.filter(function (n) {
        return !n.children;
      }))
      .enter().append("text")
      .attr("class", "node")
      .attr("dy", ".31em")
      .attr("transform", function (d) {
        return "rotate(" + (d.x - 90) + ")translate(" + (d.y + 8) + ",0)" + (d.x < 180 ? "" : "rotate(180)");
      })
      .style("text-anchor", function (d) {
        return d.x < 180 ? "start" : "end";
      })
      .text(function (d) {
        return d.key;
      })
      .on("mouseover", mouseovered)
      .on("mouseout", mouseouted);

    function mouseovered(d) {
      node
        .each(function (n) {
          n.target = n.source = false;
        });

      link
        .classed("link--target", function (l) {
          if (l.target === d) return l.source.source = true;
        })
        .classed("link--source", function (l) {
          if (l.source === d) return l.target.target = true;
        })
        .filter(function (l) {
          return l.target === d || l.source === d;
        })
        .each(function () {
          this.parentNode.appendChild(this);
        });

      node
        .classed("node--target", function (n) {
          return n.target;
        })
        .classed("node--source", function (n) {
          return n.source;
        });
    }

    function mouseouted(d) {
      link
        .classed("link--target", false)
        .classed("link--source", false);

      node
        .classed("node--target", false)
        .classed("node--source", false);
    }

    d3.select(self.frameElement).style("height", diameter + "px");

    // Lazily construct the package hierarchy from class names.
    function packageHierarchy(classes) {
      var map = {};

      function find(name, data) {
        var node = map[name],
          i;
        if (!node) {
          node = map[name] = data || {
            name: name,
            children: []
          };
          if (name.length) {
            node.parent = find(name.substring(0, i = name.lastIndexOf(".")));
            node.parent.children.push(node);
            node.key = name.substring(i + 1);
          }
        }
        return node;
      }

      classes.forEach(function (d) {
        find(d.name, d);
      });

      return map[""];
    }

    // Return a list of imports for the given array of nodes.
    function packageImports(nodes) {
      var map = {},
        imports = [];

      // Compute a map from name to node.
      nodes.forEach(function (d) {
        map[d.name] = d;
      });

      // For each import, construct a link from the source to target node.
      nodes.forEach(function (d) {
        if (d.imports) d.imports.forEach(function (i) {
          imports.push({
            source: map[d.name],
            target: map[i]
          });
        });
      });

      return imports;
    }

  }

});
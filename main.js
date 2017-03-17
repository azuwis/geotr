var getIPsFromInput = function(input) {
    var ip_regexp = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
    var ip_regexp_rfc1918 = /^(?:10|127|172\.(?:1[6-9]|2[0-9]|3[01])|192\.168)\..*/;
    var ips = input.trim().split("\n")
        .map(function(elem) {
            if (elem.indexOf('traceroute') >= 0) {
                return null;
            }
            var m = elem.match(ip_regexp);
            if (m){
                return m[0];
            } else {
                return null;
            }
        })
        .filter(function(elem) {
            return elem && !elem.match(ip_regexp_rfc1918);
        });
    return ips;
};

var getInfoMulti = function(ips, url_func, map_func, method, callback_func) {
    var failed = false;
    var info = [];
    ips.forEach(function(elem, index) {
        $.get(url_func(elem), function(resp){
            NProgress.inc(0.05);
            resp['num'] = index + 1;
            info.push(resp);
            if (ips.length == info.length) {
                if (failed) {
                    callback_func(null);
                } else {
                    info = info.sort(function(x, y) {
                        return x['num'] - y['num'];
                    }).map(map_func);
                    callback_func(info);
                }
            }
        }, method)
            .fail(function() {
                failed = true;
                info.push({});
                if (ips.length == info.length) {
                    toastr.warning('Failed to get IP info, please disable adblock on this page if you have any.');
                    callback_func(null);
                }
            });
    });
};

var getInfo = {
    ipapi: function(ips, func) {
        var post_data = ips.map(function(elem) {
            return {query: elem};
        });
        var info = [];
        NProgress.set(0.5);
        $.post('//ip-api.com/batch', JSON.stringify(post_data), function(resp) {
            info = resp.map(function(elem, index) {
                var region = '', city = '', isp = '';
                if (elem.isp.match(/(backbone|cnc group)/i)) {
                    region = '';
                    city = '';
                } else {
                    region = elem.regionName;
                    city = elem.city;
                }
                isp = elem.isp;
                if (elem.isp.match(/telecom/i)) {
                    isp = 'TEL';
                } else if (elem.isp.match(/(cnc|unicom)/i)) {
                    isp = 'CNC';
                }
                return {
                    num: index + 1,
                    ip: elem.query,
                    country: elem.country,
                    region: region,
                    city: city,
                    isp: isp,
                    lat: elem.lat,
                    lon: elem.lon
                };
            });
            func(info);
        }, 'json')
            .fail(function() {
                toastr.warning('Failed to get IP info, please disable adblock on this page if you have any.');
                func(null);
            });
    },
    ipinfo: function(ips, func) {
        getInfoMulti(ips,
                     function(elem) {
                         return '//ipinfo.io/' + elem + '/?callback=?';
                     },
                     function(elem) {
                         var [lat, lon] = elem.loc.split(',');
                         return {
                             num: elem.num,
                             ip: elem.ip,
                             country: elem.country,
                             region: elem.region,
                             city: elem.city,
                             isp: '',
                             lat: lat,
                             lon: lon
                         };
                     },
                     'jsonp', func);
    },
    freegeoip: function(ips, func) {
        getInfoMulti(ips,
                     function(elem) {
                         return '//freegeoip.net/json/' + elem + '?callback=?';
                     },
                     function(elem) {
                         return {
                             num: elem.num,
                             ip: elem.ip,
                             country: elem.country_name,
                             region: elem.region_name,
                             city: elem.city,
                             isp: '',
                             lat: elem.latitude,
                             lon: elem.longitude
                         };
                     },
                     'jsonp', func);
    },
    nekudo: function(ips, func) {
        getInfoMulti(ips,
                     function(elem) {
                         return '//geoip.nekudo.com/api/' + elem + '/full';
                     },
                     function(elem) {
                         var region = '', city = '';
                         var subdivisions = elem.subdivisions;
                         if (subdivisions) {
                             region = subdivisions[0].names.en;
                         }
                         var elem_city = elem.city;
                         if (elem_city) {
                             city = elem_city.names.en;
                         }
                         return {
                             num: elem.num,
                             ip: elem.traits.ip_address,
                             country: elem.country.names.en,
                             region: region,
                             city: city,
                             isp: '',
                             lat: elem.location.latitude,
                             lon: elem.location.longitude
                         };
                     },
                     'json', func);
    }
};

var getLocsFromInfo = function(info) {
    var data = info.filter(function(elem) {
        return elem.region != '' && elem.city != '';
    });
    var locs = [];
    var last_lat = 0, last_lon = 0;
    for (var i = 0; i < data.length; i++) {
        var elem = data[i];
        var lat = elem.lat;
        var lon = elem.lon;
        if (!(lat == last_lat && lon == last_lon)) {
            locs.push({
                // label: String(elem[0]),
                lat: lat,
                lon: lon,
                html: elem.country + ', ' + elem.region + ', ' + elem.city
            });
        }
        last_lat = lat;
        last_lon = lon;
    }
    return locs;
};

$(function() {
    if (location.protocol == 'https:') {
        $('.no-https').remove();
    }

    $('#traceroute').one('focus', function() {
        $(this).val('');
    });

    $('#clear').click(function() {
        $('#traceroute').val('');
    });

    var table = $('#table').DataTable({
        info: false,
        paging: false,
        searching: false,
        columns: [
            { data: 'num' },
            { data: 'ip' },
            { data: 'country' },
            { data: 'region' },
            { data: 'city' },
            { data: 'isp' },
            { data: 'lat' },
            { data: 'lon' }
        ]
    });

    var map = new Maplace({
        locations: [{
            lat: 0,
            lon: -180,
            zoom: 2
        }],
        type: 'polyline',
        stroke_options: {
            icons: [{
                icon: {path: google.maps.SymbolPath.FORWARD_OPEN_ARROW},
                offset: '20px',
                repeat: '300px'
            }],
            strokeColor: '#FF0000'
        }
    }).Load();

    var locations = [];
    var map_loaded = false;
    $('.submit').click(function(event) {
        event.preventDefault();
        table.clear().draw(false);
        if (map_loaded) {
            map.Load({
                locations: [{
                    lat: 0,
                    lon: -180,
                    zoom: 2
                }]});
        }
        var id = $(this).attr('id');
        var input = $('#traceroute').val();
        var ips = getIPsFromInput(input);
        if (ips.length > 0) {
            NProgress.start();
            $('.submit').prop('disabled', true);
            var func = getInfo[id];
            if (typeof func == 'function') {
                func(ips, function(info) {
                    if (info) {
                        table.rows.add(info).draw(false);
                        locations = getLocsFromInfo(info);
                        map.SetLocations(locations, true);
                        map_loaded = true;
                    }
                    NProgress.done();
                    $('.submit').prop('disabled', false);
                });
            }
        } else {
            toastr.info('Paste the output of "traceroute -n IP" in the form and submit.');
        }
    });

    $('#table tbody').on('click', 'tr', function() {
        var data = table.row(this).data();
        var lat = data.lat;
        var lon = data.lon;
        var index;
        for (index = 0; index < locations.length; index++) {
            if (lat == locations[index].lat && lon == locations[index].lon) {
                break;
            }
        }
        map.ViewOnMap(index + 1);
    });
});

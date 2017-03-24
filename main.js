var google_geocode_url = 'https://maps.googleapis.com/maps/api/geocode/json?key=AIzaSyBJgAgToHzsALJU9r_jITovS3Puo3_G-Cw&address=';

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

var getInfoMulti = function(arg) {
    var requests = arg.ips.map(function(elem) {
        return arg.deferred_func(elem).then(function(data) {
            NProgress.inc(0.05);
            data = arg.map_func(data);
            if(data.address) {
                return $.get(google_geocode_url + data.address)
                    .then(function(geo, textStatus, jqXHR) {
                        var results = geo.results;
                        if (results.length > 0) {
                            var location = results[0].geometry.location;
                            data.lat = location.lat;
                            data.lon = location.lng;
                        }
                        return [data, textStatus, jqXHR];
                    });
            } else {
                return arguments;
            }
        });
    });
    $.when.apply(undefined, requests).done(function() {
        var results = Array.from(arguments);
        var info = results.map(function(elem, index) {
            var result = elem[0];
            result.num = index + 1;
            result.ip = arg.ips[index];
            return result;
        });
        arg.callback_func(info);
    }).fail(function() {
        notifyError();
        arg.callback_func(null);
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
                notifyError();
                func(null);
            });
    },
    ipinfo: function(ips, func) {
        getInfoMulti({
            ips: ips,
            deferred_func: function(ip) {
                return $.ajax({
                    url: '//ipinfo.io/' + ip,
                    dataType: 'jsonp'
                });
            },
            map_func: function(info) {
                var [lat, lon] = info.loc.split(',');
                return {
                    country: info.country,
                    region: info.region,
                    city: info.city,
                    isp: '',
                    lat: lat,
                    lon: lon
                };
            },
            callback_func: func
        });
    },
    freegeoip: function(ips, func) {
        getInfoMulti({
            ips: ips,
            deferred_func: function(ip) {
                return $.ajax({
                    url: '//freegeoip.net/json/' + ip,
                    dataType: 'jsonp'
                    // cache: true,
                    // jsonpCallback: 'callback_' + ip.replace(/\./g, '_')
                });
            },
            map_func: function(info) {
                return {
                    country: info.country_name,
                    region: info.region_name,
                    city: info.city,
                    isp: '',
                    lat: info.latitude,
                    lon: info.longitude
                };
            },
            callback_func: func
        });
    },
    nekudo: function(ips, func) {
        getInfoMulti({
            ips: ips,
            deferred_func: function(ip) {
                return $.ajax({
                    url: '//geoip.nekudo.com/api/' + ip + '/full',
                    dataType: 'json'
                });
            },
            map_func: function(info) {
                var region = '', city = '';
                var subdivisions = info.subdivisions;
                if (subdivisions) {
                    region = subdivisions[0].names.en;
                }
                var info_city = info.city;
                if (info_city) {
                    city = info_city.names.en;
                }
                return {
                    country: info.country.names.en,
                    region: region,
                    city: city,
                    isp: '',
                    lat: info.location.latitude,
                    lon: info.location.longitude
                };
            },
            callback_func: func
        });
    },
    pconline: function(ips, func) {
        getInfoMulti({
            ips: ips,
            deferred_func: function(ip) {
                return $.ajax({
                    url: '//whois.pconline.com.cn/ipJson.jsp?ip=' + ip,
                    dataType: 'jsonp'
                });
            },
            map_func: function(info) {
                var country = '', region = '', city = '', isp = '', addr = '';
                var [x, y] = info.addr.split(' ');
                if (info.addr.match(/(骨干|全国联通)/)) {
                    country = '中国';
                    region = ' ';
                    city = ' ';
                    isp = info.addr;
                } else if (x != '') {
                    country = '中国';
                    region = info.pro;
                    city = info.city;
                    addr = x;
                    if (y != '') {
                        isp = y;
                    }
                } else {
                    country = y;
                    region = ' ';
                    city = ' ';
                    addr = y;
                }
                return {
                    country: country,
                    region: region,
                    city: city,
                    isp: isp,
                    lat: '',
                    lon: '',
                    address: addr
                };
            },
            callback_func: func
        });
    },
    sina: function(ips, func) {
        getInfoMulti(ips,
                     function(elem) {
                         return '//int.dpool.sina.com.cn/iplookup/iplookup.php?format=js&ip=' + elem;
                     },
                     function(elem) {
                         var address = remote_ip_info.country + ',' + remote_ip_info.province + ',' + remote_ip_info.city;
                         return {
                             country: remote_ip_info.country,
                             region: remote_ip_info.province,
                             city: remote_ip_info.city,
                             isp: remote_ip_info.isp,
                             lat: '',
                             lon: '',
                             address: address
                         };
                     },
                     'script', func);
    }
};

var getLocsFromInfo = function(info) {
    var data = info.filter(function(elem) {
        return elem.region != '' && !!elem.lat && !!elem.lon;
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

var notifyAdblock = function() {
    toastr.warning('Please disable adblock on this page to make IP info APIs work.', '', {timeOut: 0});
};

var notifyError = function() {
    toastr.warning('Failed to get IP info, please try another IP info provider.');
};

var resetMap = function(map) {
    if (!(map.Loaded() && map.markers.length == 1 && map.markers[0].lat == 0 && map.markers[0].lon == -180)) {
        map.Load({
            locations: [{
                lat: 0,
                lon: -180,
                zoom: 2
            }]});
    }
};

var viewOnMap = function(map, lat, lon) {
    var index;
    var markers = map.markers;
    for (index = 0; index < markers.length; index++) {
        if (lat == markers[index].lat && lon == markers[index].lon) {
            break;
        }
    }
    map.ViewOnMap(index + 1);
};

$(function() {
    $.getScript('advertisement.js').fail(function() {
        notifyAdblock();
    });

    if (location.protocol == 'https:') {
        $('.no-https').remove();
    }

    $('#traceroute').one('focus', function() {
        $(this).val('');
    });

    $('#clear').click(function() {
        $('#traceroute').val('');
        resetMap(map);
    });

    $.fn.dataTable.ext.errMode = 'none';
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
    }).on('error.dt', function(e, settings, techNote, message) {
        console.log('DataTables: ', message);
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

    $('.submit').click(function(event) {
        event.preventDefault();
        table.clear().draw(false);
        resetMap(map);
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
                        var locations = getLocsFromInfo(info);
                        map.SetLocations(locations, true);
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
        viewOnMap(map, data.lat, data.lon);
    });
});

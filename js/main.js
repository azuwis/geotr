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

var getInfoMulti = function(ips, func) {
    var requests = ips.map(function(ip) {
        return func(ip).then(function(data) {
            if(data.address) {
                return $.get(google_geocode_url + data.address)
                    .then(function(geo) {
                        var results = geo.results;
                        if (results.length > 0) {
                            var location = results[0].geometry.location;
                            data.lat = location.lat;
                            data.lon = location.lng;
                        }
                        return data;
                    });
            } else {
                return data;
            }
        });
    });
    return $.when.apply(undefined, requests).then(function() {
        return Array.from(arguments).map(function(data, index) {
            data.num = index + 1;
            data.ip = ips[index];
            return data;
        });
    });
};

var getInfo = {
    ipapi: function(ips) {
        return $.ajax({
            type: 'POST',
            url: '//ip-api.com/batch',
            data: JSON.stringify(ips.map(function(elem) {
                return {query: elem};
            })),
            dataType: 'json'
        }).then(function(data) {
            return data.map(function(elem, index) {
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
        });
    },
    ipinfo: function(ips) {
        return getInfoMulti(ips, function(ip) {
            return $.ajax({
                url: '//ipinfo.io/' + ip,
                dataType: 'json'
            }).then(function(data) {
                var [lat, lon] = data.loc.split(',');
                return {
                    country: data.country,
                    region: data.region,
                    city: data.city,
                    isp: '',
                    lat: lat,
                    lon: lon
                };
            });
        });
    },
    freegeoip: function(ips) {
        return getInfoMulti(ips, function(ip) {
            return $.ajax({
                url: '//freegeoip.net/json/' + ip,
                dataType: 'jsonp'
                // cache: true,
                // jsonpCallback: 'callback_' + ip.replace(/\./g, '_')
            }).then(function(data) {
                return {
                    country: data.country_name,
                    region: data.region_name,
                    city: data.city,
                    isp: '',
                    lat: data.latitude,
                    lon: data.longitude
                };
            });
        });
    },
    nekudo: function(ips) {
        return getInfoMulti(ips, function(ip) {
            return $.ajax({
                url: '//geoip.nekudo.com/api/' + ip + '/full',
                dataType: 'json'
            }).then(function(data) {
                var region = '', city = '';
                var subdivisions = data.subdivisions;
                if (subdivisions) {
                    region = subdivisions[0].names.en;
                }
                var data_city = data.city;
                if (data_city) {
                    city = data_city.names.en;
                }
                return {
                    country: data.country.names.en,
                    region: region,
                    city: city,
                    isp: '',
                    lat: data.location.latitude,
                    lon: data.location.longitude
                };
            });
        });
    },
    pconline: function(ips) {
        return getInfoMulti(ips, function(ip) {
            return $.ajax({
                url: '//whois.pconline.com.cn/ipJson.jsp?ip=' + ip,
                dataType: 'jsonp'
            }).then(function(data) {
                var country = '', region = '', city = '', isp = '', addr = '', marker;
                var [x, y] = data.addr.split(' ');
                if (data.addr.match(/(骨干|全国联通)/)) {
                    country = '中国';
                    isp = data.addr;
                } else if (x != '') {
                    country = '中国';
                    region = data.pro;
                    city = data.city;
                    addr = x;
                    if (y != '') {
                        isp = y;
                    }
                } else {
                    country = y;
                    marker = true;
                    addr = y;
                }
                return {
                    country: country,
                    region: region,
                    city: city,
                    isp: isp,
                    lat: '',
                    lon: '',
                    address: addr,
                    marker: marker
                };
            });
        });
    },
    sina: function(ips) {
        sina.init();
        return getInfoMulti(ips, function(ip) {
            return sina.getInfo(ip).then(function(data) {
                var address = data.country + ',' + data.province + ',' + data.city;
                var marker;
                if (data.country != '中国') {
                    marker = true;
                }
                return {
                    country: data.country,
                    region: data.province,
                    city: data.city,
                    isp: data.isp,
                    lat: '',
                    lon: '',
                    address: address,
                    marker: marker
                };
            });
        });
    }
};

var getLocsFromInfo = function(info) {
    var data = info.filter(function(elem) {
        if (elem.marker != undefined) {
            return elem.marker;
        } else {
            return elem.region && !!elem.lat && !!elem.lon;
        }
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
                html: [elem.country, elem.region, elem.city].filter(function(elem) {return elem;}).join(', ')
            });
        }
        last_lat = lat;
        last_lon = lon;
    }
    return locs;
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

var sina = {
    id: 0,
    deferreds: {},
    callback: function(id, ip, info) {
        if (info) {
            this.deferreds[id].resolve(info);
        } else {
            this.deferreds[id].reject(info);
        }
        $('iframe#sina-' + id).remove();
    },
    getInfo: function(ip) {
        var iframe = $('<iframe id="sina-' + this.id + '" src="iframe/sina.html#' + this.id + '-' + ip + '" style="display: none;"></iframe>');
        $('body').append(iframe);
        var deferred =  $.Deferred();
        this.deferreds[this.id] = deferred;
        this.id++;
        return deferred.promise();
    },
    init: function() {
        this.deferreds = {};
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
    $.ajax({
        url: 'js/advertisement.js',
        dataType: 'script',
        cache: true
    }).fail(function() {
        toastr.warning('Please disable adblock on this page to make IP info APIs work.', '', {timeOut: 0});
    });

    if (location.protocol == 'https:') {
        $('label.geotr-api-no-https').remove();
        $('li.geotr-api-no-https').hide();
    }

    $('#traceroute').one('focus', function() {
        $(this).val('');
    });

    $('#clear').click(function() {
        $('#traceroute').val('');
        $('table').DataTable().clear().draw(false);
        resetMap(map);
    });

    $.fn.dataTable.ext.errMode = 'none';
    $('table').DataTable({
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

    toastr.options = {
        'positionClass': 'toast-bottom-right'
    };

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

    $('input:checkbox.geotr-api').each(function() {
        var cookies = Cookies.get();
        if (!$.isEmptyObject(cookies)) {
            var checkbox = $(this);
            checkbox.prop('checked', !!cookies[checkbox.val()]);
        }
    });

    $('input:radio[name=geotr-api]').click(function() {
        var radio = $(this);
        var value = radio.val();
        $('input:checkbox.geotr-api').each(function() {
            var checkbox = $(this);
            var should_check = false;
            if (value == 'all' || value == 'none') {
                should_check = value == 'all';
            } else if (value == 'recommend') {
                should_check = checkbox.hasClass('geotr-api-recommend');
            }
            checkbox.prop('checked', should_check);
        });
    });

    $('#submit').click(function(event) {
        event.preventDefault();
        $('table').DataTable().clear().draw(false);
        resetMap(map);
        var input = $('#traceroute').val();
        var ips = getIPsFromInput(input);
        var tabActive = false;
        if (ips.length > 0) {
            $('#submit, #clear').prop('disabled', true);
            var requests = $('input:checkbox.geotr-api:checked').map(function() {
                var checkbox = $(this);
                var value = checkbox.val();
                var tab = $('#tab-' + value);
                tab.show().css({opacity: 0.3});
                Cookies.set(value, 1, {expires: 30});
                var func = getInfo[value];
                return func(ips).done(function(info) {
                    if (!tabActive) {
                        mui.tabs.activate('pane-' + value);
                        tabActive = true;
                        var locations = getLocsFromInfo(info);
                        map.SetLocations(locations, true);
                    }
                    $('#pane-' + value + ' table').DataTable().rows.add(info).draw(false);
                }).fail(function() {
                    toastr.warning(value.toUpperCase() + ': Failed to get IP info.');
                }).always(function() {
                    tab.css({opacity: 1});
                });
            });
            $.when.apply(undefined, requests).done(function() {
                $('#submit, #clear').prop('disabled', false);
            });
            $('input:checkbox.geotr-api:not(:checked)').each(function() {
                var value = $(this).val();
                $('#tab-' + value).hide();
                Cookies.remove(value);
            });
        } else {
            toastr.warning('Paste the output of "traceroute -n IP" in the form and submit.');
        }
    });

    $('#traceroute').keydown(function(e) {
        if ((event.keyCode == 10 || event.keyCode == 13) && event.ctrlKey) {
            $('#submit').click();
        }
    });

    $('#geotr-tabs li').click(function() {
        var tab = $(this);
        var table = $(tab.attr('id').replace('tab-', '#pane-') + ' table').DataTable();
        var info = table.rows().data();
        var locations = getLocsFromInfo(info);
        map.SetLocations(locations, true);
    });

    $('table tbody').on('click', 'tr', function() {
        var table = $(this).closest('table').DataTable();
        var data = table.row(this).data();
        viewOnMap(map, data.lat, data.lon);
    });
});
